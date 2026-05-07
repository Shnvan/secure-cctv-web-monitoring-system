"""Pose-only AI processing pipeline."""
from __future__ import annotations

import asyncio
import base64
import binascii
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import logging
import threading
import time
from typing import Any

import cv2
import numpy as np

from .detector import (
    pose_detector, motion_detector,
    enhance_frame, POSE_CONNECTIONS,
)
from .pose_smoothing import EmaPoseSmoother

logger = logging.getLogger(__name__)

# FIX: BUG-06 — one worker per camera so both cameras can run MediaPipe
# concurrently. MediaPipe releases the GIL in its native code, so two threads
# give real parallelism on multi-core CPUs.
_MAX_WORKERS = 4

# Name of the pose model in use, exposed to the dashboard for the System Status
# panel (Phase 3).
POSE_MODEL_NAME = 'MediaPipe BlazePose (complexity=1, 33 landmarks)'


def decode_frame_payload(frame_data: str | bytes | bytearray) -> tuple[np.ndarray | None, str | None]:
    """Decode a browser-sent JPEG frame from binary bytes or legacy base64 text."""
    try:
        if isinstance(frame_data, str):
            if ',' in frame_data:
                frame_data = frame_data.split(',', 1)[1]
            img_bytes = base64.b64decode(frame_data, validate=False)
        elif isinstance(frame_data, (bytes, bytearray)):
            img_bytes = bytes(frame_data)
        else:
            return None, 'Unsupported frame payload type'

        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return None, 'Failed to decode image'
        return frame, None
    except (binascii.Error, ValueError) as exc:
        return None, f'Invalid frame payload: {exc}'
    except Exception as exc:
        logger.error('Frame decode error: %s', exc)
        return None, str(exc)


class AIProcessor:
    """Singleton full-frame pose processing pipeline with per-camera locks."""

    def __init__(self) -> None:
        self._camera_locks: dict[str, threading.Lock] = {}
        self._lock_guard = threading.Lock()
        self._settings: dict[str, Any] = {
            'enabled': True,
            'fps': 15,                      # FIX: BUG-07 — raise default target FPS
            'pose_enabled': True,
            'enhancement_enabled': True,    # CLAHE low-light enhancement
            'motion_gating': True,          # Skip static frames
            # FIX: BUG-08 — detection_confidence is what MediaPipe uses; it is
            # distinct from the frontend-only display_min_visibility filter.
            'detection_confidence': 0.5,
            # Kept for backward compatibility with any saved client state.
            'confidence_threshold': 0.5,
        }
        # Track last event log time per camera to avoid log spam
        self._last_logged: dict[str, float] = {}
        self._log_interval = 5.0  # seconds between audit log entries per camera

        # Cache last pose results per camera for motion-gating fallback.
        self._last_result: dict[str, dict[str, Any]] = {}

        # FIX: BUG-05 — default alpha lowered from 0.65 → 0.45 for more
        # responsive-but-stable smoothing; widen stale window so short motion
        # gaps do not reset the smoother state; relax visibility floor to 0.2
        # so lower-body joints (typical visibility 0.3–0.7) actually get blended.
        self._pose_smoother = EmaPoseSmoother(
            alpha=0.45, min_visibility=0.2, stale_after_frames=120,
        )
        self._processed_frame_times: dict[str, list[float]] = {}

        # FIX: BUG-06 — dedicated thread pool so the async WebSocket endpoints
        # can offload the CPU-bound MediaPipe call without blocking the event
        # loop. Workers run independently per camera.
        self._executor = ThreadPoolExecutor(
            max_workers=_MAX_WORKERS, thread_name_prefix='ai-pose',
        )

        # FIX: BUG-13 — even when motion gating rejects a frame, we still need
        # to run pose detection periodically so that a person sitting still in
        # front of the camera actually produces a skeleton. Without a keepalive
        # the first-seen-motion requirement would mean a stationary subject is
        # never detected, never cached, and never rendered. 1.0s is a good
        # middle ground: ~70x fewer MediaPipe invocations than ungated but
        # still visually "instant" to a human observer.
        self._keepalive_interval_s = 1.0
        self._last_pose_attempt_at: dict[str, float] = {}

    def _get_camera_lock(self, camera_id: str) -> threading.Lock:
        with self._lock_guard:
            if camera_id not in self._camera_locks:
                self._camera_locks[camera_id] = threading.Lock()
            return self._camera_locks[camera_id]

    def update_settings(self, new_settings: dict[str, Any]) -> dict[str, Any]:
        for key, value in new_settings.items():
            if key in self._settings:
                self._settings[key] = value
        # Keep detection_confidence and the legacy confidence_threshold aliased
        # for backward-compat with older clients / saved state.
        if 'detection_confidence' in new_settings:
            self._settings['confidence_threshold'] = new_settings['detection_confidence']
        elif 'confidence_threshold' in new_settings:
            self._settings['detection_confidence'] = new_settings['confidence_threshold']
        return dict(self._settings)

    def get_settings(self) -> dict[str, Any]:
        return dict(self._settings)

    def reset_camera(self, camera_id: str) -> None:
        """Release per-camera state (called on WS disconnect)."""
        self._last_result.pop(camera_id, None)
        self._processed_frame_times.pop(camera_id, None)
        self._last_pose_attempt_at.pop(camera_id, None)
        self._pose_smoother.reset_camera(camera_id)
        try:
            pose_detector.reset_camera(camera_id)
        except AttributeError:
            pass
        try:
            motion_detector.reset_camera(camera_id)
        except AttributeError:
            pass

    def _empty_result(self, camera_id: str, **extra: Any) -> dict[str, Any]:
        result: dict[str, Any] = {
            'detections': [],
            'poses': [],
            'faces': [],
            'alerts': [],
            'descriptions': [],
            'pose_connections': POSE_CONNECTIONS,
            'timestamp': time.time(),
            'camera_id': camera_id,
            'processing_ms': 0,
            'frame_width': 0,
            'frame_height': 0,
            'timings_ms': {},
            'ai_fps': 0,
            'person_count': 0,
            'model': POSE_MODEL_NAME,
        }
        result.update(extra)
        return result

    def process_frame(self, frame_data: str | bytes | bytearray, camera_id: str,
                      camera_name: str = '') -> dict[str, Any]:
        """Process a single frame through the pose-only AI pipeline.

        Args:
            frame_data: JPEG bytes or legacy base64-encoded JPEG image data.
            camera_id: Camera identifier.
            camera_name: Ignored compatibility argument.

        Returns:
            Pose result with empty non-pose compatibility arrays.
        """
        if not self._settings['enabled']:
            return self._empty_result(camera_id)

        lock = self._get_camera_lock(camera_id)
        if not lock.acquire(blocking=False):
            # Previous frame still processing, skip this one
            return self._empty_result(camera_id, skipped=True)

        try:
            return self._process_frame_impl(frame_data, camera_id, camera_name)
        finally:
            lock.release()

    async def process_frame_async(self, frame_data: str | bytes | bytearray,
                                  camera_id: str,
                                  camera_name: str = '') -> dict[str, Any]:
        """Async wrapper that offloads CPU work to the dedicated thread pool.

        # FIX: BUG-06 — the WebSocket endpoint previously called process_frame
        # synchronously from an async handler, which blocked the event loop and
        # serialized both cameras through a single thread. Running in the pool
        # lets cameras 1 and 2 execute MediaPipe in parallel.
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor, self.process_frame, frame_data, camera_id, camera_name,
        )

    def _process_frame_impl(self, frame_data: str | bytes | bytearray, camera_id: str,
                            camera_name: str) -> dict[str, Any]:
        start_time = time.perf_counter()
        wall_time = time.time()
        timings_ms: dict[str, float] = {}

        def mark_stage(stage: str, stage_start: float) -> float:
            now = time.perf_counter()
            timings_ms[stage] = round((now - stage_start) * 1000, 1)
            return now

        # Decode JPEG payload to numpy array.
        stage_start = time.perf_counter()
        frame, decode_error = decode_frame_payload(frame_data)
        mark_stage('decode', stage_start)
        if frame is None:
            return self._empty_result(camera_id, error=decode_error or 'Failed to decode image')

        frame_h, frame_w = frame.shape[:2]

        # ---- Motion Gating ----
        # Skip AI processing if no motion detected (saves ~80% CPU)
        if self._settings['motion_gating']:
            stage_start = time.perf_counter()
            motion = motion_detector.has_motion(frame, camera_id)
            mark_stage('motion', stage_start)

            # FIX: BUG-13 — keepalive: even without motion, run pose detection
            # once per keepalive interval so a stationary person is still seen.
            last_attempt = self._last_pose_attempt_at.get(camera_id, 0.0)
            keepalive_due = (wall_time - last_attempt) >= self._keepalive_interval_s

            if not motion and not keepalive_due:
                # FIX: BUG-05 case 2 — keep the smoother "alive" during motion
                # gaps so the first post-gap frame blends with the last known
                # pose instead of snapping. We re-smooth the cached pose
                # (idempotent for same coords) which also refreshes last_seen.
                cached = self._last_result.get(camera_id)
                if cached and cached.get('poses'):
                    self._pose_smoother.smooth(camera_id, cached['poses'])
                    result = deepcopy(cached)
                    result['motion'] = False
                    result['timestamp'] = wall_time
                    result['processing_ms'] = round((time.perf_counter() - start_time) * 1000, 1)
                    result['timings_ms'] = timings_ms
                    result['ai_fps'] = self._record_processed_fps(camera_id, wall_time)
                    return result
                return self._empty_result(
                    camera_id,
                    motion=False,
                    processing_ms=round((time.perf_counter() - start_time) * 1000, 1),
                    frame_width=frame_w,
                    frame_height=frame_h,
                    timings_ms=timings_ms,
                )

        # ---- Low-Light Enhancement (CLAHE) ----
        if self._settings['enhancement_enabled']:
            stage_start = time.perf_counter()
            frame = enhance_frame(frame)
            mark_stage('enhancement', stage_start)

        result: dict[str, Any] = {
            'detections': [],
            'poses': [],
            'faces': [],
            'alerts': [],
            'descriptions': [],
            'timestamp': wall_time,
            'camera_id': camera_id,
            'motion': True,
            'frame_width': frame_w,
            'frame_height': frame_h,
            'model': POSE_MODEL_NAME,
        }

        # Full-frame MediaPipe pose detection. V1 targets the primary visible person.
        person_count = 0
        if self._settings['pose_enabled']:
            stage_start = time.perf_counter()
            # FIX: BUG-01 — route camera_id into the detector so each camera uses
            # its own MediaPipe Pose instance.
            # FIX: BUG-08 — pass the live detection_confidence so slider changes
            # actually take effect in MediaPipe.
            detection_conf = float(self._settings.get(
                'detection_confidence',
                self._settings.get('confidence_threshold', 0.5),
            ))
            pose = pose_detector.detect_pose(
                frame, camera_id=camera_id, detection_confidence=detection_conf,
            )
            # FIX: BUG-13 — record attempt time even when MediaPipe returns
            # no pose, so the keepalive resets uniformly.
            self._last_pose_attempt_at[camera_id] = wall_time
            if pose:
                result['poses'] = self._pose_smoother.smooth(camera_id, [pose])
                person_count = 1
            mark_stage('pose', stage_start)

        result['person_count'] = person_count
        # Add pose connection data for frontend skeleton drawing
        result['pose_connections'] = POSE_CONNECTIONS

        # Processing time
        result['processing_ms'] = round((time.perf_counter() - start_time) * 1000, 1)
        result['timings_ms'] = timings_ms
        result['ai_fps'] = self._record_processed_fps(camera_id, wall_time)

        # Cache this result for motion-gating fallback
        self._last_result[camera_id] = result

        return result

    def _record_processed_fps(self, camera_id: str, now: float) -> float:
        # FIX: BUG-11 — trim by time window FIRST, then cap size. The old order
        # (`del frame_times[:-100]` before the time filter) made the rolling
        # 5-second semantics kick in only after 100 frames accumulated, giving
        # incorrect ai_fps readouts early in a session.
        frame_times = self._processed_frame_times.setdefault(camera_id, [])
        frame_times.append(now)
        cutoff = now - 5.0
        frame_times[:] = [ts for ts in frame_times if ts >= cutoff]
        if len(frame_times) > 100:
            del frame_times[:-100]
        if len(frame_times) < 2:
            return 0
        elapsed = frame_times[-1] - frame_times[0]
        if elapsed <= 0:
            return 0
        return round((len(frame_times) - 1) / elapsed, 2)

    def should_log_event(self, camera_id: str) -> bool:
        """Rate-limit audit logging to avoid flooding the audit log."""
        now = time.time()
        last = self._last_logged.get(camera_id, 0)
        if now - last >= self._log_interval:
            self._last_logged[camera_id] = now
            return True
        return False

    def should_log_alert(self) -> bool:
        """Alerts are always logged immediately."""
        return True


ai_processor = AIProcessor()
