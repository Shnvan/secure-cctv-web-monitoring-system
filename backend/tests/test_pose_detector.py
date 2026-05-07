"""Tests for the per-camera PoseDetector isolation (regression for BUG-01)."""
from __future__ import annotations

import numpy as np
import pytest

pytest.importorskip('cv2')

from app.ai.detector import PoseDetector


class _FakeLandmark:
    def __init__(self, x: float, y: float, visibility: float) -> None:
        self.x = x
        self.y = y
        self.visibility = visibility


class _FakeResult:
    def __init__(self, landmarks):
        if landmarks is None:
            self.pose_landmarks = None
        else:
            class _Holder:
                pass

            holder = _Holder()
            holder.landmark = landmarks
            self.pose_landmarks = holder


class _FakePose:
    """Tracks which camera_id's frames it has processed to prove isolation."""

    instances: list['_FakePose'] = []

    def __init__(self, **_kwargs) -> None:
        self.seen_shapes: list[tuple[int, int]] = []
        self.closed = False
        _FakePose.instances.append(self)

    def process(self, frame):
        h, w = frame.shape[:2]
        self.seen_shapes.append((h, w))
        # Return a single valid landmark so the detector returns a keypoint list.
        return _FakeResult([_FakeLandmark(0.5, 0.5, 0.9)])

    def close(self) -> None:
        self.closed = True


class _FakeMpSolutionsPose:
    Pose = _FakePose


class _FakeMpSolutions:
    pose = _FakeMpSolutionsPose


class _FakeMp:
    solutions = _FakeMpSolutions


@pytest.fixture(autouse=True)
def _reset_fake_instances():
    _FakePose.instances.clear()
    yield
    _FakePose.instances.clear()


def _inject_fake_mediapipe(monkeypatch):
    import sys

    monkeypatch.setitem(sys.modules, 'mediapipe', _FakeMp)


def test_pose_detector_creates_one_instance_per_camera(monkeypatch):
    """BUG-01 regression: each camera must get its own MediaPipe Pose."""
    _inject_fake_mediapipe(monkeypatch)
    detector = PoseDetector()

    frame_a = np.zeros((48, 64, 3), dtype=np.uint8)
    frame_b = np.zeros((48, 64, 3), dtype=np.uint8)

    detector.detect_pose(frame_a, camera_id='camera-1', detection_confidence=0.5)
    detector.detect_pose(frame_b, camera_id='camera-2', detection_confidence=0.5)

    assert len(_FakePose.instances) == 2, (
        'Expected one MediaPipe Pose instance per camera; got '
        f'{len(_FakePose.instances)}'
    )
    # Camera 1's Pose must only have seen camera 1 frames, and vice versa.
    cam1_pose, cam2_pose = _FakePose.instances
    assert len(cam1_pose.seen_shapes) == 1
    assert len(cam2_pose.seen_shapes) == 1


def test_pose_detector_reuses_instance_for_same_camera(monkeypatch):
    _inject_fake_mediapipe(monkeypatch)
    detector = PoseDetector()

    frame = np.zeros((48, 64, 3), dtype=np.uint8)
    detector.detect_pose(frame, camera_id='camera-1', detection_confidence=0.5)
    detector.detect_pose(frame, camera_id='camera-1', detection_confidence=0.5)

    assert len(_FakePose.instances) == 1
    assert len(_FakePose.instances[0].seen_shapes) == 2


def test_pose_detector_rebuilds_on_threshold_change(monkeypatch):
    """BUG-08 regression: slider changes must actually propagate to MediaPipe."""
    _inject_fake_mediapipe(monkeypatch)
    detector = PoseDetector()

    frame = np.zeros((48, 64, 3), dtype=np.uint8)
    detector.detect_pose(frame, camera_id='camera-1', detection_confidence=0.3)
    detector.detect_pose(frame, camera_id='camera-1', detection_confidence=0.7)

    assert len(_FakePose.instances) == 2
    # First instance should have been closed when replaced.
    assert _FakePose.instances[0].closed is True


def test_pose_detector_reset_camera_releases_instance(monkeypatch):
    _inject_fake_mediapipe(monkeypatch)
    detector = PoseDetector()

    frame = np.zeros((48, 64, 3), dtype=np.uint8)
    detector.detect_pose(frame, camera_id='camera-1', detection_confidence=0.5)
    first = _FakePose.instances[0]

    detector.reset_camera('camera-1')
    assert first.closed is True

    detector.detect_pose(frame, camera_id='camera-1', detection_confidence=0.5)
    assert len(_FakePose.instances) == 2
    assert _FakePose.instances[1] is not first


def test_pose_detector_keypoints_are_within_frame_bounds(monkeypatch):
    """Keypoints returned to the frontend must be within the frame rectangle.

    This catches coordinate-scaling regressions (BUG-02 class).
    """
    _inject_fake_mediapipe(monkeypatch)
    detector = PoseDetector()

    width, height = 64, 48
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    keypoints = detector.detect_pose(
        frame, camera_id='camera-1', detection_confidence=0.5,
    )

    assert keypoints, 'fake pose should return at least one landmark'
    for kp in keypoints:
        assert 0 <= kp['x'] <= width
        assert 0 <= kp['y'] <= height
