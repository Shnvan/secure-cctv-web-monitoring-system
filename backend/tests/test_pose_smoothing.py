from app.ai.pose_smoothing import EmaPoseSmoother


def _pose(x: float, y: float, visibility: float = 0.9):
    return [
        {'x': x, 'y': y, 'visibility': visibility, 'name': 'nose'},
        {'x': x + 10, 'y': y + 10, 'visibility': visibility, 'name': 'left_shoulder'},
    ]


def test_ema_pose_smoother_blends_visible_keypoints_by_track_id():
    smoother = EmaPoseSmoother(alpha=0.5)
    detections = [{'track_id': 7}]

    first = smoother.smooth('camera-1', [_pose(100, 100)], detections)
    second = smoother.smooth('camera-1', [_pose(120, 140)], detections)

    assert first[0][0]['x'] == 100
    assert second[0][0]['x'] == 110
    assert second[0][0]['y'] == 120


def test_ema_pose_smoother_interpolates_low_confidence_keypoints():
    smoother = EmaPoseSmoother(alpha=0.5, min_visibility=0.3)
    detections = [{'track_id': 7}]

    smoother.smooth('camera-1', [_pose(100, 100, 0.9)], detections)
    smoothed = smoother.smooth('camera-1', [_pose(200, 200, 0.1)], detections)

    assert smoothed[0][0]['x'] == 100
    assert smoothed[0][0]['y'] == 100
    assert smoothed[0][0]['visibility'] == 0.765
    assert smoothed[0][0]['interpolated'] is True


def test_ema_pose_smoother_keeps_cameras_independent():
    smoother = EmaPoseSmoother(alpha=0.5)
    detections = [{'track_id': 7}]

    smoother.smooth('camera-1', [_pose(100, 100)], detections)
    smoothed = smoother.smooth('camera-2', [_pose(200, 200)], detections)

    assert smoothed[0][0]['x'] == 200
    assert smoothed[0][0]['y'] == 200
