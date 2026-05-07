from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Literal

Role = Literal['super_admin', 'security_admin', 'viewer', 'auditor', 'camera_source']
CameraAction = Literal['view', 'publish', 'manage']


class Principal(BaseModel):
    id: str
    email: str
    roles: list[Role] = Field(default_factory=list)
    camera_grants: dict[str, list[CameraAction]] = Field(default_factory=dict)
    disabled: bool = False


class Camera(BaseModel):
    id: str
    name: str
    room: str
    status: Literal['online', 'offline', 'disabled', 'maintenance'] = 'offline'
    enabled: bool = True


class TokenRequest(BaseModel):
    purpose: Literal['view', 'publish']


class TokenResponse(BaseModel):
    camera_id: str
    room: str
    token: str
    expires_in_seconds: int


class PublisherEventRequest(BaseModel):
    event: Literal[
        'publisher_started',
        'publisher_stopped',
        'publisher_disconnected',
        'publisher_failed',
    ]
    message: str | None = None


# --- AI Detection Models ---

class AIDetection(BaseModel):
    label: str
    confidence: float
    bbox: list[float]
    class_id: int = 0
    track_id: int | None = None


class AIPoseKeypoint(BaseModel):
    x: float
    y: float
    visibility: float
    name: str


class AIFaceResult(BaseModel):
    bbox: list[float]
    name: str
    confidence: float
    is_known: bool


class AIBehaviorAlert(BaseModel):
    alert_type: str
    severity: str
    camera_id: str
    description: str
    timestamp: float = 0


class AIFrameResult(BaseModel):
    detections: list[AIDetection] = Field(default_factory=list)
    poses: list[list[AIPoseKeypoint]] = Field(default_factory=list)
    faces: list[AIFaceResult] = Field(default_factory=list)
    alerts: list[AIBehaviorAlert] = Field(default_factory=list)
    descriptions: list[str] = Field(default_factory=list)
    pose_connections: list[list[int]] = Field(default_factory=list)
    timestamp: float = 0
    camera_id: str = ''
    processing_ms: float = 0
    frame_width: int = 0
    frame_height: int = 0
    timings_ms: dict[str, float] = Field(default_factory=dict)
    ai_fps: float = 0
    person_count: int = 0
    model: str = ''
    motion: bool | None = None
    skipped: bool = False
    error: str | None = None


class KnownFace(BaseModel):
    name: str
    folder_name: str = ''
    image_count: int = 0


class AISettings(BaseModel):
    enabled: bool = True
    fps: int = 15
    pose_enabled: bool = True
    enhancement_enabled: bool = True
    motion_gating: bool = True
    # FIX: BUG-08 — detection_confidence is the authoritative MediaPipe
    # threshold. confidence_threshold stays as a deprecated alias so older
    # clients can still write to it.
    detection_confidence: float = 0.5
    confidence_threshold: float = 0.5
