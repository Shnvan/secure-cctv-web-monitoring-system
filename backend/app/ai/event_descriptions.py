"""Smart event description generator for AI detection events."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _format_time(ts: float | None = None) -> str:
    """Format timestamp as 12-hour local time string."""
    if ts is None:
        dt = datetime.now()
    else:
        dt = datetime.fromtimestamp(ts)
    return dt.strftime('%I:%M %p').lstrip('0')


def describe_detections(detections: list[dict[str, Any]],
                        camera_name: str) -> list[str]:
    """Generate plain English descriptions for object detections."""
    if not detections:
        return []

    descriptions: list[str] = []
    time_str = _format_time()

    # Count objects by label
    counts: dict[str, int] = {}
    for det in detections:
        label = det.get('label', 'object')
        counts[label] = counts.get(label, 0) + 1

    person_count = counts.get('person', 0)

    if person_count == 1:
        conf = next(
            (d['confidence'] for d in detections if d.get('label') == 'person'), 0
        )
        descriptions.append(
            f'{time_str} — Person detected at {camera_name} ({int(conf * 100)}% confidence)'
        )
    elif person_count > 1:
        descriptions.append(
            f'{time_str} — {person_count} persons detected at {camera_name}'
        )

    # Non-person objects
    non_person = {k: v for k, v in counts.items() if k != 'person'}
    if non_person:
        total = sum(non_person.values())
        items = ', '.join(f'{v} {k}' for k, v in sorted(non_person.items()))
        if person_count > 0:
            descriptions.append(
                f'{time_str} — Objects detected at {camera_name}: {items}'
            )
        else:
            descriptions.append(
                f'{time_str} — {total} object(s) detected at {camera_name}: {items}'
            )

    return descriptions


def describe_faces(faces: list[dict[str, Any]],
                   camera_name: str) -> list[str]:
    """Generate descriptions for face recognition results."""
    descriptions: list[str] = []
    time_str = _format_time()

    for face in faces:
        name = face.get('name', 'Unknown')
        confidence = face.get('confidence', 0)
        is_known = face.get('is_known', False)

        if is_known:
            descriptions.append(
                f"{time_str} — Known person '{name}' recognized at "
                f'{camera_name} ({int(confidence * 100)}% confidence)'
            )
        else:
            descriptions.append(
                f'{time_str} — Unknown person detected at {camera_name}'
            )

    return descriptions


def describe_alerts(alerts: list[dict[str, Any]],
                    camera_name: str) -> list[str]:
    """Generate descriptions for behavior alerts."""
    descriptions: list[str] = []

    for alert in alerts:
        alert_type = alert.get('alert_type', '')
        time_str = _format_time(alert.get('timestamp'))

        if alert_type == 'loitering':
            duration = alert.get('duration_seconds', 30)
            descriptions.append(
                f'{time_str} — ⚠️ Possible loitering detected at {camera_name}'
                f' — person stationary for {duration} seconds'
            )
        elif alert_type == 'fall':
            descriptions.append(
                f'{time_str} — 🚨 FALL DETECTED at {camera_name}'
                f' — person went from standing to ground level'
            )
        elif alert_type == 'fighting':
            person_count = alert.get('person_count', 2)
            descriptions.append(
                f'{time_str} — 🚨 FIGHTING DETECTED at {camera_name}'
                f' — {person_count} persons in aggressive contact'
            )

    return descriptions


def generate_smart_descriptions(
    detections: list[dict[str, Any]],
    faces: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
    camera_name: str,
) -> list[str]:
    """Generate all smart event descriptions for a single frame analysis."""
    all_descriptions: list[str] = []
    all_descriptions.extend(describe_alerts(alerts, camera_name))
    all_descriptions.extend(describe_faces(faces, camera_name))
    all_descriptions.extend(describe_detections(detections, camera_name))
    return all_descriptions
