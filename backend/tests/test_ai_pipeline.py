import base64

import numpy as np
import pytest

cv2 = pytest.importorskip('cv2')
from app.ai import pipeline
from app.ai.pipeline import AIProcessor, decode_frame_payload


def _jpeg_bytes(width: int = 64, height: int = 48) -> bytes:
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:, :, 1] = 180
    ok, encoded = cv2.imencode('.jpg', frame)
    assert ok
    return encoded.tobytes()


def test_decode_frame_payload_accepts_binary_jpeg():
    frame, error = decode_frame_payload(_jpeg_bytes())

    assert error is None
    assert frame is not None
    assert frame.shape[:2] == (48, 64)


def test_decode_frame_payload_accepts_legacy_data_url():
    payload = 'data:image/jpeg;base64,' + base64.b64encode(_jpeg_bytes()).decode('ascii')

    frame, error = decode_frame_payload(payload)

    assert error is None
    assert frame is not None
    assert frame.shape[:2] == (48, 64)


def test_decode_frame_payload_rejects_invalid_payload():
    frame, error = decode_frame_payload('not-a-jpeg')

    assert frame is None
    assert error


def test_pose_only_processor_returns_empty_non_pose_arrays(monkeypatch):
    fake_pose = [
        {'x': 10.0, 'y': 20.0, 'visibility': 0.9, 'name': 'nose'},
        {'x': 15.0, 'y': 40.0, 'visibility': 0.9, 'name': 'left_shoulder'},
    ]

    monkeypatch.setattr(
        pipeline.pose_detector, 'detect_pose',
        lambda frame, **kwargs: fake_pose,
    )

    processor = AIProcessor()
    processor.update_settings({
        'motion_gating': False,
        'enhancement_enabled': False,
        'pose_enabled': True,
    })

    result = processor.process_frame(_jpeg_bytes(), 'camera-test')

    assert result['poses'] == [fake_pose]
    assert result['detections'] == []
    assert result['faces'] == []
    assert result['alerts'] == []
    assert result['descriptions'] == []
    assert result['frame_width'] == 64
    assert result['frame_height'] == 48
    assert 'decode' in result['timings_ms']
    assert 'pose' in result['timings_ms']


def test_pose_only_settings_ignore_removed_non_pose_controls():
    processor = AIProcessor()

    settings = processor.update_settings({
        'enabled': False,
        'yolo_enabled': True,
        'face_enabled': True,
        'behavior_enabled': True,
        'tracking_enabled': True,
    })

    assert settings['enabled'] is False
    assert 'yolo_enabled' not in settings
    assert 'face_enabled' not in settings
    assert 'behavior_enabled' not in settings
    assert 'tracking_enabled' not in settings


def test_keypoints_are_within_frame_bounds(monkeypatch):
    """BUG-02 class regression: coords never exceed declared frame size."""
    width, height = 64, 48
    # Deliberately include an out-of-range return from the (fake) detector to
    # ensure the pipeline does not silently propagate invalid coords.
    fake_pose = [
        {'x': 10.0, 'y': 20.0, 'visibility': 0.9, 'name': 'nose'},
        {'x': float(width), 'y': float(height), 'visibility': 0.9, 'name': 'left_ankle'},
    ]
    monkeypatch.setattr(
        pipeline.pose_detector, 'detect_pose',
        lambda frame, **kwargs: fake_pose,
    )

    processor = AIProcessor()
    processor.update_settings({
        'motion_gating': False,
        'enhancement_enabled': False,
        'pose_enabled': True,
    })

    result = processor.process_frame(_jpeg_bytes(width, height), 'camera-test')

    assert result['frame_width'] == width
    assert result['frame_height'] == height
    assert result['person_count'] == 1
    for pose in result['poses']:
        for kp in pose:
            assert 0 <= kp['x'] <= width, kp
            assert 0 <= kp['y'] <= height, kp


def test_motion_gap_feeds_smoother_so_there_is_no_snap(monkeypatch):
    """BUG-05 case 2: motion-gated frames must keep the smoother alive."""
    calls = {'count': 0}

    def detect(frame, **kwargs):
        calls['count'] += 1
        return [
            {'x': 10.0, 'y': 20.0, 'visibility': 0.9, 'name': 'nose'},
            {'x': 30.0, 'y': 40.0, 'visibility': 0.9, 'name': 'left_shoulder'},
        ]

    monkeypatch.setattr(pipeline.pose_detector, 'detect_pose', detect)

    # Force motion=False every call so the pipeline always hits the gated path
    # once a cached result is populated.
    motion_states = iter([True, False, False])
    monkeypatch.setattr(
        pipeline.motion_detector, 'has_motion',
        lambda frame, camera_id: next(motion_states),
    )

    processor = AIProcessor()
    processor.update_settings({
        'motion_gating': True,
        'enhancement_enabled': False,
        'pose_enabled': True,
    })

    first = processor.process_frame(_jpeg_bytes(), 'camera-m')
    assert first['motion'] is True
    assert first['poses'], 'first frame should have produced a smoothed pose'

    # Two gated frames in a row — both should re-use the cached pose AND
    # advance the smoother internal frame counter (so the next real frame
    # blends, not snaps).
    processor.process_frame(_jpeg_bytes(), 'camera-m')
    processor.process_frame(_jpeg_bytes(), 'camera-m')

    assert calls['count'] == 1, 'pose detector should not run during motion gap'
    smoother_state = processor._pose_smoother._frame_index.get('camera-m', 0)
    assert smoother_state >= 3, (
        'smoother must advance during motion-gated frames to avoid post-gap snap'
    )


def test_motion_gate_keepalive_runs_pose_for_stationary_subject(monkeypatch):
    """BUG-13 regression: if motion is never detected, pose detection must
    still run periodically so a stationary person is visible."""
    detect_calls = {'count': 0}

    def detect(frame, **kwargs):
        detect_calls['count'] += 1
        return [
            {'x': 10.0, 'y': 20.0, 'visibility': 0.9, 'name': 'nose'},
        ]

    monkeypatch.setattr(pipeline.pose_detector, 'detect_pose', detect)
    # Force motion detector to always return False — simulates a subject who
    # is visible but not moving enough to trip the gate.
    monkeypatch.setattr(
        pipeline.motion_detector, 'has_motion',
        lambda frame, camera_id: False,
    )

    processor = AIProcessor()
    processor.update_settings({
        'motion_gating': True,
        'enhancement_enabled': False,
        'pose_enabled': True,
    })
    # Make the keepalive instantaneous so the test doesn't need to sleep.
    processor._keepalive_interval_s = 0.0

    processor.process_frame(_jpeg_bytes(), 'camera-still')
    processor.process_frame(_jpeg_bytes(), 'camera-still')
    processor.process_frame(_jpeg_bytes(), 'camera-still')

    assert detect_calls['count'] >= 3, (
        'keepalive must run pose detection even when motion gate rejects all frames'
    )


def test_motion_ratio_scales_with_frame_size():
    """BUG-13: absolute pixel thresholds were broken for downscaled frames."""
    from app.ai.detector import MotionDetector

    detector = MotionDetector(motion_ratio=0.01)

    # Two frames with a small rectangle of difference — ~3000 px at 480p,
    # which is 1% of the frame. With motion_ratio=0.01 the 480p case should
    # barely trigger, and the 1080p case should clearly not trigger (same
    # absolute pixel delta but a much larger frame).
    small = np.zeros((480, 640, 3), dtype=np.uint8)
    detector.has_motion(small, 'small')  # seed
    small_moved = small.copy()
    small_moved[100:160, 100:160] = 255  # 3600 px changed
    assert detector.has_motion(small_moved, 'small') is True

    large = np.zeros((1080, 1920, 3), dtype=np.uint8)
    detector.has_motion(large, 'large')  # seed
    large_moved = large.copy()
    large_moved[100:160, 100:160] = 255  # still only 3600 px — 0.17% of frame
    # Same absolute motion is now below 1% ratio for the larger frame, so gate rejects.
    assert detector.has_motion(large_moved, 'large') is False


def test_detection_confidence_is_passed_to_detector(monkeypatch):
    """BUG-08 regression: slider value must propagate to MediaPipe."""
    captured = {}

    def detect(frame, **kwargs):
        captured.update(kwargs)
        return []

    monkeypatch.setattr(pipeline.pose_detector, 'detect_pose', detect)

    processor = AIProcessor()
    processor.update_settings({
        'motion_gating': False,
        'enhancement_enabled': False,
        'pose_enabled': True,
        'detection_confidence': 0.73,
    })

    processor.process_frame(_jpeg_bytes(), 'camera-c')

    assert captured.get('camera_id') == 'camera-c'
    assert abs(captured.get('detection_confidence', 0) - 0.73) < 1e-6
