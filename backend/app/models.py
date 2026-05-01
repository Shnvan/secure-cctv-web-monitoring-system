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
