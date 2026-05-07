"""Behavioral analysis: loitering, fall, and fighting detection using pose data."""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


class BehaviorAnalyzer:
    """Analyzes person poses over time to detect suspicious behavior."""

    def __init__(self, loitering_threshold_seconds: int = 30) -> None:
        self._loitering_threshold = loitering_threshold_seconds
        # Track person positions over time: camera_id -> list of {center, time, pose}
        self._person_tracks: dict[str, list[dict[str, Any]]] = defaultdict(list)
        # Previous frame poses for velocity calculation
        self._prev_poses: dict[str, list[list[dict[str, Any]]]] = {}
        # Alert cooldowns: (camera_id, alert_type) -> last_alert_time
        self._cooldowns: dict[tuple[str, str], float] = {}
        self._cooldown_seconds = 30.0

    def _is_on_cooldown(self, camera_id: str, alert_type: str) -> bool:
        key = (camera_id, alert_type)
        last_time = self._cooldowns.get(key, 0)
        return (time.time() - last_time) < self._cooldown_seconds

    def _set_cooldown(self, camera_id: str, alert_type: str) -> None:
        self._cooldowns[(camera_id, alert_type)] = time.time()

    def _get_pose_center(self, keypoints: list[dict[str, Any]]) -> tuple[float, float] | None:
        """Get center of mass from hip and shoulder landmarks."""
        hip_shoulder_indices = [11, 12, 23, 24]  # shoulders and hips
        valid_points = []
        for idx in hip_shoulder_indices:
            if idx < len(keypoints) and keypoints[idx].get('visibility', 0) > 0.3:
                valid_points.append((keypoints[idx]['x'], keypoints[idx]['y']))

        if not valid_points:
            return None

        cx = sum(p[0] for p in valid_points) / len(valid_points)
        cy = sum(p[1] for p in valid_points) / len(valid_points)
        return (cx, cy)

    def _detect_loitering(self, camera_id: str,
                          poses: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
        """Detect if any person has been stationary for too long."""
        alerts: list[dict[str, Any]] = []
        now = time.time()

        for pose_keypoints in poses:
            if not pose_keypoints:
                continue

            center = self._get_pose_center(pose_keypoints)
            if center is None:
                continue

            # Add to tracks
            self._person_tracks[camera_id].append({
                'center': center,
                'time': now,
            })

        # Clean old track entries (older than 2x threshold)
        max_age = self._loitering_threshold * 2
        self._person_tracks[camera_id] = [
            t for t in self._person_tracks[camera_id]
            if (now - t['time']) < max_age
        ]

        # Check if any cluster of positions stayed within 50px radius
        tracks = self._person_tracks[camera_id]
        if len(tracks) < 5:
            return alerts

        # Get positions from the last threshold-seconds window
        window_tracks = [t for t in tracks if (now - t['time']) <= self._loitering_threshold]
        if len(window_tracks) < 3:
            return alerts

        # Calculate spatial spread
        positions = [t['center'] for t in window_tracks]
        xs = [p[0] for p in positions]
        ys = [p[1] for p in positions]
        spread_x = max(xs) - min(xs)
        spread_y = max(ys) - min(ys)

        if spread_x < 50 and spread_y < 50:
            duration = now - window_tracks[0]['time']
            if duration >= self._loitering_threshold and not self._is_on_cooldown(camera_id, 'loitering'):
                self._set_cooldown(camera_id, 'loitering')
                alerts.append({
                    'alert_type': 'loitering',
                    'severity': 'warning',
                    'camera_id': camera_id,
                    'timestamp': now,
                    'description': f'Person stationary for {int(duration)} seconds',
                    'duration_seconds': int(duration),
                })

        return alerts

    def _detect_fall(self, camera_id: str,
                     poses: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
        """Detect falls by checking if a person's pose becomes horizontal."""
        alerts: list[dict[str, Any]] = []

        for pose_keypoints in poses:
            if not pose_keypoints or len(pose_keypoints) < 29:
                continue

            # Get shoulder and hip positions
            l_shoulder = pose_keypoints[11] if pose_keypoints[11].get('visibility', 0) > 0.3 else None
            r_shoulder = pose_keypoints[12] if pose_keypoints[12].get('visibility', 0) > 0.3 else None
            l_hip = pose_keypoints[23] if pose_keypoints[23].get('visibility', 0) > 0.3 else None
            r_hip = pose_keypoints[24] if pose_keypoints[24].get('visibility', 0) > 0.3 else None
            l_ankle = pose_keypoints[27] if pose_keypoints[27].get('visibility', 0) > 0.3 else None
            r_ankle = pose_keypoints[28] if pose_keypoints[28].get('visibility', 0) > 0.3 else None

            if not (l_shoulder or r_shoulder) or not (l_hip or r_hip):
                continue

            # Average shoulder and hip Y positions
            shoulder_y = np.mean([p['y'] for p in [l_shoulder, r_shoulder] if p])
            hip_y = np.mean([p['y'] for p in [l_hip, r_hip] if p])
            shoulder_x_spread = 0
            if l_shoulder and r_shoulder:
                shoulder_x_spread = abs(l_shoulder['x'] - r_shoulder['x'])

            # Torso height (vertical distance between shoulder and hip)
            torso_height = abs(hip_y - shoulder_y)

            # If torso is nearly horizontal (shoulder-hip height is small
            # relative to shoulder width), person may have fallen
            if shoulder_x_spread > 0 and torso_height < shoulder_x_spread * 0.5:
                # Additional check: are ankles at similar height to hips?
                if l_ankle or r_ankle:
                    ankle_y = np.mean([p['y'] for p in [l_ankle, r_ankle] if p])
                    # If ankles are at similar Y as shoulders, person is horizontal
                    if abs(ankle_y - shoulder_y) < torso_height * 2:
                        if not self._is_on_cooldown(camera_id, 'fall'):
                            self._set_cooldown(camera_id, 'fall')
                            alerts.append({
                                'alert_type': 'fall',
                                'severity': 'critical',
                                'camera_id': camera_id,
                                'timestamp': time.time(),
                                'description': 'Person went from standing to ground level',
                            })

        return alerts

    def _detect_fighting(self, camera_id: str,
                         poses: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
        """Detect fighting: 2+ persons close together with rapid arm movement."""
        alerts: list[dict[str, Any]] = []

        if len(poses) < 2:
            return alerts

        # Get centers of all detected persons
        centers = []
        for pose_kp in poses:
            if not pose_kp:
                continue
            c = self._get_pose_center(pose_kp)
            if c:
                centers.append(c)

        # Check proximity between pairs
        close_pairs = 0
        for i in range(len(centers)):
            for j in range(i + 1, len(centers)):
                dist = np.sqrt(
                    (centers[i][0] - centers[j][0]) ** 2
                    + (centers[i][1] - centers[j][1]) ** 2
                )
                if dist < 100:
                    close_pairs += 1

        if close_pairs == 0:
            return alerts

        # Check arm velocity by comparing with previous frame
        prev = self._prev_poses.get(camera_id, [])
        if prev and len(prev) >= 2:
            # Calculate wrist movement velocity
            max_velocity = 0
            for curr_pose in poses:
                if not curr_pose or len(curr_pose) < 17:
                    continue
                for prev_pose in prev:
                    if not prev_pose or len(prev_pose) < 17:
                        continue
                    # Left and right wrists (indices 15, 16)
                    for wrist_idx in [15, 16]:
                        if (curr_pose[wrist_idx].get('visibility', 0) > 0.3
                                and prev_pose[wrist_idx].get('visibility', 0) > 0.3):
                            dx = curr_pose[wrist_idx]['x'] - prev_pose[wrist_idx]['x']
                            dy = curr_pose[wrist_idx]['y'] - prev_pose[wrist_idx]['y']
                            velocity = np.sqrt(dx ** 2 + dy ** 2)
                            max_velocity = max(max_velocity, velocity)

            # High velocity + close proximity = potential fight
            if max_velocity > 40 and not self._is_on_cooldown(camera_id, 'fighting'):
                self._set_cooldown(camera_id, 'fighting')
                alerts.append({
                    'alert_type': 'fighting',
                    'severity': 'critical',
                    'camera_id': camera_id,
                    'timestamp': time.time(),
                    'description': f'{len(centers)} persons in aggressive contact',
                    'person_count': len(centers),
                })

        # Store current poses for next frame comparison
        self._prev_poses[camera_id] = poses

        return alerts

    def analyze(self, camera_id: str,
                poses: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
        """Run all behavior analyses and return combined alerts."""
        all_alerts: list[dict[str, Any]] = []

        if not poses:
            return all_alerts

        all_alerts.extend(self._detect_loitering(camera_id, poses))
        all_alerts.extend(self._detect_fall(camera_id, poses))
        all_alerts.extend(self._detect_fighting(camera_id, poses))

        return all_alerts


behavior_analyzer = BehaviorAnalyzer()
