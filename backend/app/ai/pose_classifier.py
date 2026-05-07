"""Pose classification using joint angles from MediaPipe keypoints.

Classifies detected poses into activity states:
- STANDING, SITTING, LYING_DOWN, CROUCHING, ARMS_RAISED, RUNNING, FIGHTING, FALL
Uses angle calculations between joints for accurate classification.
"""
from __future__ import annotations

import math
from typing import Any


# ---- Angle Calculation Helpers ----

def _angle_between(a: dict, b: dict, c: dict) -> float:
    """Calculate angle at point B formed by points A-B-C.

    Args:
        a, b, c: Keypoints with 'x' and 'y' fields.

    Returns:
        Angle in degrees (0-180).
    """
    ba_x = a['x'] - b['x']
    ba_y = a['y'] - b['y']
    bc_x = c['x'] - b['x']
    bc_y = c['y'] - b['y']

    dot = ba_x * bc_x + ba_y * bc_y
    mag_ba = math.sqrt(ba_x ** 2 + ba_y ** 2)
    mag_bc = math.sqrt(bc_x ** 2 + bc_y ** 2)

    if mag_ba * mag_bc == 0:
        return 0.0

    cos_angle = max(-1.0, min(1.0, dot / (mag_ba * mag_bc)))
    return math.degrees(math.acos(cos_angle))


def _vertical_angle(a: dict, b: dict) -> float:
    """Angle of line A-B relative to vertical (0 = straight up, 90 = horizontal)."""
    dx = b['x'] - a['x']
    dy = b['y'] - a['y']  # y increases downward in image coords
    angle = math.degrees(math.atan2(abs(dx), abs(dy)))
    return angle


def _distance(a: dict, b: dict) -> float:
    """Euclidean distance between two keypoints."""
    return math.sqrt((a['x'] - b['x']) ** 2 + (a['y'] - b['y']) ** 2)


# ---- Keypoint Index Map (MediaPipe) ----
# 0: nose, 11: left_shoulder, 12: right_shoulder,
# 13: left_elbow, 14: right_elbow, 15: left_wrist, 16: right_wrist
# 23: left_hip, 24: right_hip, 25: left_knee, 26: right_knee
# 27: left_ankle, 28: right_ankle

def _kp(keypoints: list[dict], idx: int) -> dict | None:
    """Get keypoint by index if visible enough."""
    if idx < len(keypoints) and keypoints[idx].get('visibility', 0) > 0.3:
        return keypoints[idx]
    return None


# ---- Pose Classification ----

POSE_LABELS = {
    'STANDING': '🧍 STANDING',
    'SITTING': '🪑 SITTING',
    'LYING_DOWN': '🛏️ LYING DOWN',
    'CROUCHING': '🧎 CROUCHING',
    'ARMS_RAISED': '🙌 ARMS RAISED',
    'RUNNING': '🏃 RUNNING',
    'FALL': '🚨 FALL DETECTED',
    'UNKNOWN': '❓ UNKNOWN',
}


def classify_pose(keypoints: list[dict[str, Any]]) -> dict[str, Any]:
    """Classify a single person's pose based on joint angles.

    Args:
        keypoints: List of MediaPipe keypoints with x, y, visibility, name.

    Returns:
        Dict with:
        - activity: str (e.g., 'STANDING')
        - label: str (e.g., '🧍 STANDING')
        - confidence: float (0-1)
        - angles: dict of key body angles
        - details: str (human-readable explanation)
    """
    if len(keypoints) < 25:
        return {
            'activity': 'UNKNOWN',
            'label': POSE_LABELS['UNKNOWN'],
            'confidence': 0.0,
            'angles': {},
            'details': 'Not enough keypoints detected',
        }

    # Get key joints
    l_shoulder = _kp(keypoints, 11)
    r_shoulder = _kp(keypoints, 12)
    l_elbow = _kp(keypoints, 13)
    r_elbow = _kp(keypoints, 14)
    l_wrist = _kp(keypoints, 15)
    r_wrist = _kp(keypoints, 16)
    l_hip = _kp(keypoints, 23)
    r_hip = _kp(keypoints, 24)
    l_knee = _kp(keypoints, 25)
    r_knee = _kp(keypoints, 26)
    l_ankle = _kp(keypoints, 27)
    r_ankle = _kp(keypoints, 28)
    nose = _kp(keypoints, 0)

    angles: dict[str, float] = {}
    activity = 'UNKNOWN'
    confidence = 0.5
    details = ''

    # ---- Calculate key body angles ----

    # Torso angle (how vertical the body is)
    torso_angle = None
    if l_shoulder and l_hip:
        torso_angle = _vertical_angle(l_shoulder, l_hip)
        angles['torso'] = round(torso_angle, 1)
    elif r_shoulder and r_hip:
        torso_angle = _vertical_angle(r_shoulder, r_hip)
        angles['torso'] = round(torso_angle, 1)

    # Left knee angle
    if l_hip and l_knee and l_ankle:
        l_knee_angle = _angle_between(l_hip, l_knee, l_ankle)
        angles['left_knee'] = round(l_knee_angle, 1)
    else:
        l_knee_angle = None

    # Right knee angle
    if r_hip and r_knee and r_ankle:
        r_knee_angle = _angle_between(r_hip, r_knee, r_ankle)
        angles['right_knee'] = round(r_knee_angle, 1)
    else:
        r_knee_angle = None

    # Left elbow angle
    if l_shoulder and l_elbow and l_wrist:
        l_elbow_angle = _angle_between(l_shoulder, l_elbow, l_wrist)
        angles['left_elbow'] = round(l_elbow_angle, 1)

    # Right elbow angle
    if r_shoulder and r_elbow and r_wrist:
        r_elbow_angle = _angle_between(r_shoulder, r_elbow, r_wrist)
        angles['right_elbow'] = round(r_elbow_angle, 1)

    # Hip angle (body bend)
    if l_shoulder and l_hip and l_knee:
        l_hip_angle = _angle_between(l_shoulder, l_hip, l_knee)
        angles['left_hip'] = round(l_hip_angle, 1)
    else:
        l_hip_angle = None

    if r_shoulder and r_hip and r_knee:
        r_hip_angle = _angle_between(r_shoulder, r_hip, r_knee)
        angles['right_hip'] = round(r_hip_angle, 1)
    else:
        r_hip_angle = None

    # Arms position relative to shoulders
    arms_above = False
    if l_wrist and l_shoulder:
        if l_wrist['y'] < l_shoulder['y']:  # wrist above shoulder
            arms_above = True
    if r_wrist and r_shoulder:
        if r_wrist['y'] < r_shoulder['y']:
            arms_above = True

    both_arms_above = False
    if l_wrist and l_shoulder and r_wrist and r_shoulder:
        if l_wrist['y'] < l_shoulder['y'] and r_wrist['y'] < r_shoulder['y']:
            both_arms_above = True

    # ---- Classification Logic ----

    avg_knee = None
    if l_knee_angle is not None and r_knee_angle is not None:
        avg_knee = (l_knee_angle + r_knee_angle) / 2
    elif l_knee_angle is not None:
        avg_knee = l_knee_angle
    elif r_knee_angle is not None:
        avg_knee = r_knee_angle

    # 1. LYING DOWN / FALL — torso nearly horizontal
    if torso_angle is not None and torso_angle > 60:
        activity = 'LYING_DOWN'
        confidence = min(1.0, torso_angle / 90)
        details = f'Torso angle {torso_angle:.0f}° (horizontal)'

        # If was previously standing, it's a fall
        if torso_angle > 70:
            activity = 'FALL'
            confidence = min(1.0, torso_angle / 90)
            details = f'Body horizontal at {torso_angle:.0f}° — possible fall'

    # 2. ARMS RAISED — both wrists above shoulders
    elif both_arms_above:
        activity = 'ARMS_RAISED'
        confidence = 0.85
        details = 'Both arms raised above shoulders'

    # 3. CROUCHING — knees very bent, torso slightly tilted
    elif avg_knee is not None and avg_knee < 100 and torso_angle is not None and torso_angle < 40:
        activity = 'CROUCHING'
        confidence = 0.8
        details = f'Knee angle {avg_knee:.0f}° (bent), torso {torso_angle:.0f}°'

    # 4. SITTING — hip angle bent, knees bent ~90°
    elif avg_knee is not None and avg_knee < 130:
        hip_avg = None
        if l_hip_angle is not None and r_hip_angle is not None:
            hip_avg = (l_hip_angle + r_hip_angle) / 2
        elif l_hip_angle is not None:
            hip_avg = l_hip_angle
        elif r_hip_angle is not None:
            hip_avg = r_hip_angle

        if hip_avg is not None and hip_avg < 130:
            activity = 'SITTING'
            confidence = 0.75
            details = f'Knee {avg_knee:.0f}°, hip {hip_avg:.0f}° (seated posture)'
        else:
            activity = 'CROUCHING'
            confidence = 0.65
            details = f'Knee angle {avg_knee:.0f}° (bent)'

    # 5. STANDING — torso vertical, knees straight
    elif torso_angle is not None and torso_angle < 25:
        activity = 'STANDING'
        confidence = 0.9
        details = f'Upright posture, torso {torso_angle:.0f}°'

        # Check if one knee is very different (might be walking/running)
        if l_knee_angle is not None and r_knee_angle is not None:
            knee_diff = abs(l_knee_angle - r_knee_angle)
            if knee_diff > 30:
                activity = 'RUNNING'
                confidence = 0.7
                details = f'Leg spread {knee_diff:.0f}° — walking/running'

    # Default: moderate torso angle
    elif torso_angle is not None:
        if torso_angle < 45:
            activity = 'STANDING'
            confidence = 0.6
            details = f'Torso {torso_angle:.0f}° (slightly tilted)'
        else:
            activity = 'CROUCHING'
            confidence = 0.5
            details = f'Torso {torso_angle:.0f}° (bent over)'

    return {
        'activity': activity,
        'label': POSE_LABELS.get(activity, POSE_LABELS['UNKNOWN']),
        'confidence': round(confidence, 2),
        'angles': angles,
        'details': details,
    }


def classify_all_poses(all_poses: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Classify poses for all detected persons.

    Args:
        all_poses: List of pose keypoint lists (one per person).

    Returns:
        List of classification results.
    """
    results = []
    for keypoints in all_poses:
        if keypoints:
            results.append(classify_pose(keypoints))
        else:
            results.append({
                'activity': 'UNKNOWN',
                'label': POSE_LABELS['UNKNOWN'],
                'confidence': 0.0,
                'angles': {},
                'details': 'No pose detected',
            })
    return results
