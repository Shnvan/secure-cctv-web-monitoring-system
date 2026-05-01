from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from .audit import audit_logger
from .auth import get_current_principal, require_camera_grant, require_role, USERS
from .models import Camera, Principal, TokenRequest, TokenResponse
from .security_headers import SecurityHeadersMiddleware
from .settings import settings

try:
    from livekit import api as livekit_api
except Exception:  # pragma: no cover
    livekit_api = None

app = FastAPI(title=settings.app_name, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.allowed_origins.split(',') if origin.strip()],
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'PATCH'],
    allow_headers=['authorization', 'content-type', 'cf-access-jwt-assertion', 'x-request-id'],
)

CAMERAS: dict[str, Camera] = {
    'camera-1': Camera(id='camera-1', name='Camera 1 - Phone Source', room='camera-1-room', status='offline'),
    'camera-2': Camera(id='camera-2', name='Camera 2 - Phone Source', room='camera-2-room', status='offline'),
}


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def safe_http_error(request: Request, exc: HTTPException, action: str = 'REQUEST_DENIED') -> HTTPException:
    audit_logger.log(
        action=action,
        result='denied' if exc.status_code in (401, 403, 404) else 'failure',
        reason_code=str(exc.status_code),
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
    )
    if settings.hide_auth_failures and exc.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found')
    return exc


@app.get('/healthz', include_in_schema=False)
def healthz() -> dict[str, str]:
    # Keep this private-network-only. Do not expose detailed internals.
    return {'status': 'ok'}


@app.get('/api/v1/me')
def me(principal: Principal = Depends(get_current_principal)) -> dict:
    return principal.model_dump(exclude={'disabled'})


@app.get('/api/v1/cameras')
def list_cameras(principal: Principal = Depends(get_current_principal)) -> list[dict]:
    visible = []
    for camera_id, camera in CAMERAS.items():
        grants = principal.camera_grants.get(camera_id, [])
        if grants or 'super_admin' in principal.roles:
            visible.append(camera.model_dump())
    return visible


def mint_livekit_token(*, principal: Principal, camera: Camera, purpose: str) -> str:
    can_publish = purpose == 'publish'
    can_subscribe = purpose == 'view'

    if not settings.livekit_api_key or not settings.livekit_api_secret or livekit_api is None:
        if settings.environment == 'dev':
            return f'dev-token-not-valid-{principal.id}-{camera.id}-{purpose}'
        raise HTTPException(status_code=503, detail='Streaming service unavailable')

    participant_identity = f'{principal.id}:{camera.id}:{purpose}:{uuid.uuid4().hex[:12]}'

    token = (
        livekit_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(participant_identity)
        .with_name(f'{principal.email} ({purpose})')
        .with_ttl(timedelta(seconds=settings.stream_token_ttl_seconds))
        .with_grants(
            livekit_api.VideoGrants(
                room_join=True,
                room=camera.room,
                can_publish=can_publish,
                can_subscribe=can_subscribe,
            )
        )
    )
    return token.to_jwt()


@app.post('/api/v1/cameras/{camera_id}/stream-token', response_model=TokenResponse)
def stream_token(camera_id: str, body: TokenRequest, request: Request, principal: Principal = Depends(get_current_principal)):
    if body.purpose != 'view':
        raise safe_http_error(request, HTTPException(status_code=403, detail='Forbidden'), 'STREAM_TOKEN_DENIED')
    camera = CAMERAS.get(camera_id)
    if not camera or not camera.enabled:
        raise safe_http_error(request, HTTPException(status_code=404, detail='Not found'), 'STREAM_TOKEN_DENIED')
    try:
        require_camera_grant(principal, camera_id, 'view')
    except HTTPException as exc:
        raise safe_http_error(request, exc, 'STREAM_TOKEN_DENIED')

    token = mint_livekit_token(principal=principal, camera=camera, purpose='view')
    audit_logger.log(
        action='CAMERA_VIEW_TOKEN_ISSUED',
        result='success',
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='camera',
        target_id=camera_id,
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
        metadata={'room': camera.room, 'ttl_seconds': settings.stream_token_ttl_seconds},
    )
    return TokenResponse(camera_id=camera.id, room=camera.room, token=token, expires_in_seconds=settings.stream_token_ttl_seconds)


@app.post('/api/v1/cameras/{camera_id}/publish-token', response_model=TokenResponse)
def publish_token(camera_id: str, body: TokenRequest, request: Request, principal: Principal = Depends(get_current_principal)):
    if body.purpose != 'publish':
        raise safe_http_error(request, HTTPException(status_code=403, detail='Forbidden'), 'PUBLISH_TOKEN_DENIED')
    camera = CAMERAS.get(camera_id)
    if not camera or not camera.enabled:
        raise safe_http_error(request, HTTPException(status_code=404, detail='Not found'), 'PUBLISH_TOKEN_DENIED')
    try:
        require_camera_grant(principal, camera_id, 'publish')
    except HTTPException as exc:
        raise safe_http_error(request, exc, 'PUBLISH_TOKEN_DENIED')

    token = mint_livekit_token(principal=principal, camera=camera, purpose='publish')
    audit_logger.log(
        action='CAMERA_PUBLISH_TOKEN_ISSUED',
        result='success',
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='camera',
        target_id=camera_id,
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
        metadata={'room': camera.room, 'ttl_seconds': settings.stream_token_ttl_seconds, 'audio': False},
    )
    return TokenResponse(camera_id=camera.id, room=camera.room, token=token, expires_in_seconds=settings.stream_token_ttl_seconds)


@app.get('/api/v1/admin/audit-events')
def audit_events(principal: Principal = Depends(get_current_principal)) -> dict:
    require_role(principal, {'super_admin', 'security_admin', 'auditor'})
    return {
        'chain_valid': audit_logger.verify_chain(),
        'events': [event.__dict__ for event in audit_logger.events[-100:]],
    }


@app.get('/api/v1/admin/users')
def admin_users(principal: Principal = Depends(get_current_principal)) -> list[dict]:
    require_role(principal, {'super_admin', 'security_admin'})
    return [user.model_dump(exclude={'disabled'}) | {'status': 'disabled' if user.disabled else 'active'} for user in USERS.values()]


@app.post('/api/v1/admin/users/{email}/disable')
def disable_user(email: str, request: Request, principal: Principal = Depends(get_current_principal)) -> dict[str, str]:
    require_role(principal, {'super_admin', 'security_admin'})
    user = USERS.get(email.lower())
    if not user:
        raise HTTPException(status_code=404, detail='Not found')
    user.disabled = True
    audit_logger.log(
        action='USER_DISABLED',
        result='success',
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='user',
        target_id=email.lower(),
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
    )
    return {'status': 'disabled'}

@app.post('/api/v1/admin/security-test/denied-access')
def security_test_denied_access(
    request: Request,
    principal: Principal = Depends(get_current_principal),
) -> dict[str, str]:
    require_role(principal, {'super_admin', 'security_admin'})

    audit_logger.log(
        action='ACCESS_DENIED_TEST',
        result='denied',
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='security_test',
        target_id='simulated-denied-access',
        reason_code='SIMULATED_DENIED_ACCESS',
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
        metadata={
            'purpose': 'safe demo event',
            'note': 'This is not an attack. This event is generated to demonstrate audit logging.'
        },
    )

    return {
        'status': 'logged',
        'message': 'Simulated denied-access event was written to the audit log.',
    }

@app.get('/{path:path}', include_in_schema=False)
def catch_all(path: str) -> dict[str, str]:
    # Decoy/generic response for unknown routes.
    raise HTTPException(status_code=404, detail='Not found')
