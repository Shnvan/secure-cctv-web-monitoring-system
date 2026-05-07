"""Temporal smoothing utilities for pose keypoints."""
from __future__ import annotations

from copy import deepcopy
from typing import Any


class EmaPoseSmoother:
    """Confidence-aware exponential moving average smoother for pose keypoints."""

    def __init__(
        self,
        alpha: float = 0.65,
        min_visibility: float = 0.3,
        stale_after_frames: int = 30,
    ) -> None:
        if not 0 < alpha <= 1:
            raise ValueError('alpha must be in the range (0, 1]')
        self._alpha = alpha
        self._min_visibility = min_visibility
        self._stale_after_frames = stale_after_frames
        self._state: dict[str, dict[str, list[dict[str, Any]]]] = {}
        self._last_seen: dict[str, dict[str, int]] = {}
        self._frame_index: dict[str, int] = {}

    def reset_camera(self, camera_id: str) -> None:
        self._state.pop(camera_id, None)
        self._last_seen.pop(camera_id, None)
        self._frame_index.pop(camera_id, None)

    def smooth(
        self,
        camera_id: str,
        poses: list[list[dict[str, Any]]],
        person_detections: list[dict[str, Any]] | None = None,
    ) -> list[list[dict[str, Any]]]:
        """Return smoothed poses keyed by track ID when available, otherwise pose index."""
        frame_no = self._frame_index.get(camera_id, 0) + 1
        self._frame_index[camera_id] = frame_no
        camera_state = self._state.setdefault(camera_id, {})
        last_seen = self._last_seen.setdefault(camera_id, {})

        smoothed_poses: list[list[dict[str, Any]]] = []
        active_keys: set[str] = set()

        for pose_index, pose in enumerate(poses):
            if not pose:
                smoothed_poses.append([])
                continue

            track_id = None
            if person_detections and pose_index < len(person_detections):
                track_id = person_detections[pose_index].get('track_id')
            state_key = f'track:{track_id}' if track_id is not None else f'index:{pose_index}'
            active_keys.add(state_key)

            previous_pose = camera_state.get(state_key)
            smoothed_pose = self._smooth_pose(pose, previous_pose)
            camera_state[state_key] = deepcopy(smoothed_pose)
            last_seen[state_key] = frame_no
            smoothed_poses.append(smoothed_pose)

        stale_keys = [
            key for key, seen_at in last_seen.items()
            if key not in active_keys and frame_no - seen_at > self._stale_after_frames
        ]
        for key in stale_keys:
            camera_state.pop(key, None)
            last_seen.pop(key, None)

        return smoothed_poses

    def _smooth_pose(
        self,
        pose: list[dict[str, Any]],
        previous_pose: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if not previous_pose:
            return [dict(point) for point in pose]

        smoothed: list[dict[str, Any]] = []
        for idx, current in enumerate(pose):
            point = dict(current)
            if idx >= len(previous_pose):
                smoothed.append(point)
                continue

            previous = previous_pose[idx]
            current_visibility = float(point.get('visibility', 0))
            previous_visibility = float(previous.get('visibility', 0))

            if current_visibility >= self._min_visibility and previous_visibility >= self._min_visibility:
                point['x'] = round(
                    self._alpha * float(point['x']) + (1 - self._alpha) * float(previous['x']),
                    1,
                )
                point['y'] = round(
                    self._alpha * float(point['y']) + (1 - self._alpha) * float(previous['y']),
                    1,
                )
            elif current_visibility < self._min_visibility and previous_visibility >= self._min_visibility:
                point['x'] = previous['x']
                point['y'] = previous['y']
                point['visibility'] = round(previous_visibility * 0.85, 3)
                point['interpolated'] = True

            smoothed.append(point)

        return smoothed
