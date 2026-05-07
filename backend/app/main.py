from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
import hashlib
from io import StringIO
import json
import logging
import uuid

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .audit import audit_logger
from .auth import get_current_principal, require_camera_grant, require_role, USERS
from .models import Camera, Principal, PublisherEventRequest, TokenRequest, TokenResponse, AISettings
from .security_headers import SecurityHeadersMiddleware
from .settings import settings
from .ai.pipeline import ai_processor
from .ai.face_recognition import get_face_recognizer

logger = logging.getLogger(__name__)

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
    allow_methods=['GET', 'POST', 'PATCH', 'DELETE'],
    allow_headers=['authorization', 'content-type', 'cf-access-jwt-assertion', 'x-request-id'],
)

# Initialize AI processor settings from env
ai_processor.update_settings({
    'enabled': settings.ai_enabled,
    'fps': settings.ai_fps,
    'confidence_threshold': settings.ai_confidence_threshold,
})

CAMERAS: dict[str, Camera] = {
    'camera-1': Camera(id='camera-1', name='Camera 1 - Phone Source', room='camera-1-room', status='offline'),
    'camera-2': Camera(id='camera-2', name='Camera 2 - Phone Source', room='camera-2-room', status='offline'),
}

AUDIT_EXPORT_COLUMNS = [
    'occurred_at',
    'actor_email',
    'actor_roles',
    'action',
    'target_type',
    'target_id',
    'result',
    'reason_code',
    'source_ip',
    'user_agent_hash',
    'request_id',
    'event_hash',
    'previous_hash',
]


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


@app.post('/api/v1/cameras/{camera_id}/publisher-events')
def publisher_event(
    camera_id: str,
    body: PublisherEventRequest,
    request: Request,
    principal: Principal = Depends(get_current_principal),
) -> dict[str, str]:
    camera = CAMERAS.get(camera_id)
    if not camera or not camera.enabled:
        raise safe_http_error(request, HTTPException(status_code=404, detail='Not found'), 'CAMERA_PUBLISHER_EVENT_DENIED')
    try:
        require_camera_grant(principal, camera_id, 'publish')
    except HTTPException as exc:
        raise safe_http_error(request, exc, 'CAMERA_PUBLISHER_EVENT_DENIED')

    action_map = {
        'publisher_started': ('CAMERA_PUBLISHER_STARTED', 'success'),
        'publisher_stopped': ('CAMERA_PUBLISHER_STOPPED', 'success'),
        'publisher_disconnected': ('CAMERA_PUBLISHER_DISCONNECTED', 'success'),
        'publisher_failed': ('CAMERA_PUBLISHER_FAILED', 'failure'),
    }
    action, result = action_map[body.event]
    metadata = {'event': body.event}
    if body.message:
        metadata['message'] = body.message

    audit_logger.log(
        action=action,
        result=result,
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='camera',
        target_id=camera_id,
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
        metadata=metadata,
    )
    return {'status': 'logged', 'action': action}


@app.get('/api/v1/admin/audit-events')
def audit_events(principal: Principal = Depends(get_current_principal)) -> dict:
    require_role(principal, {'super_admin', 'security_admin', 'auditor'})
    return {
        'chain_valid': audit_logger.verify_chain(),
        'events': [event.__dict__ for event in audit_logger.events[-100:]],
    }


@app.get('/api/v1/admin/audit-events/export.csv')
def export_audit_events(request: Request, principal: Principal = Depends(get_current_principal)) -> Response:
    require_role(principal, {'super_admin', 'security_admin'})

    audit_logger.log(
        action='AUDIT_LOG_EXPORTED',
        result='success',
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='audit_log',
        target_id='export.csv',
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
    )

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=AUDIT_EXPORT_COLUMNS)
    writer.writeheader()
    for event in audit_logger.events:
        writer.writerow(
            {
                'occurred_at': event.occurred_at,
                'actor_email': event.actor_email,
                'actor_roles': ';'.join(event.actor_roles),
                'action': event.action,
                'target_type': event.target_type,
                'target_id': event.target_id,
                'result': event.result,
                'reason_code': event.reason_code,
                'source_ip': event.source_ip,
                'user_agent_hash': event.user_agent_hash,
                'request_id': event.request_id,
                'event_hash': event.event_hash,
                'previous_hash': event.previous_hash,
            }
        )

    return Response(
        content=output.getvalue(),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="audit-events.csv"'},
    )


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

# ---- AI WebSocket Endpoint ----

def _ws_authenticate(proxy_secret: str | None, identity_header_value: str | None) -> Principal | None:
    """Validate WebSocket connection using the same trusted-proxy logic as REST."""
    if not proxy_secret or proxy_secret != settings.trusted_proxy_secret:
        return None
    email = identity_header_value
    if not email:
        return None
    user = USERS.get(email)
    if not user or user.disabled:
        return None
    return user


@app.websocket('/ws/ai/camera/{camera_id}')
async def ws_ai_camera(websocket: WebSocket, camera_id: str) -> None:
    """WebSocket endpoint for real-time AI frame processing.

    Frontend sends base64-encoded JPEG frames; backend returns detection JSON.
    Authentication uses the same proxy secret injected by Caddy.
    """
    # Authenticate via headers (Caddy injects x-internal-auth-secret)
    proxy_secret = websocket.headers.get('x-internal-auth-secret')
    identity_email = websocket.headers.get(
        settings.trusted_identity_header.lower().replace('_', '-'),
        websocket.headers.get('tailscale-user-login'),
    )

    # Also support dev auth for development
    if settings.dev_auth_enabled and settings.environment == 'dev':
        dev_user = websocket.headers.get('x-dev-user')
        if dev_user and dev_user in USERS:
            principal = USERS[dev_user]
        else:
            principal = _ws_authenticate(proxy_secret, identity_email)
    else:
        principal = _ws_authenticate(proxy_secret, identity_email)

    if principal is None:
        await websocket.close(code=4001, reason='Unauthorized')
        return

    # Check camera access
    if camera_id not in CAMERAS:
        await websocket.close(code=4004, reason='Camera not found')
        return

    camera = CAMERAS[camera_id]
    user_grants = principal.camera_grants.get(camera_id, [])
    if 'view' not in user_grants and 'manage' not in user_grants:
        await websocket.close(code=4003, reason='Access denied')
        return

    await websocket.accept()
    logger.info('AI WebSocket connected: user=%s camera=%s', principal.email, camera_id)
    # FIX: BUG-01 — ensure this camera starts with a clean MediaPipe instance
    # and smoother state, even if a previous session left something behind.
    ai_processor.reset_camera(camera_id)

    try:
        while True:
            message = await websocket.receive()
            if message.get('type') == 'websocket.disconnect':
                break

            data = message.get('bytes')
            if data is None:
                data = message.get('text')
            if data is None:
                await websocket.send_text(json.dumps({
                    'detections': [],
                    'poses': [],
                    'faces': [],
                    'alerts': [],
                    'descriptions': [],
                    'pose_connections': [],
                    'timestamp': datetime.now(timezone.utc).timestamp(),
                    'camera_id': camera_id,
                    'processing_ms': 0,
                    'error': 'Empty frame payload',
                }))
                continue

            # FIX: BUG-06 — run MediaPipe in the AI thread pool so the event
            # loop stays free for the other camera's WebSocket.
            result = await ai_processor.process_frame_async(
                frame_data=data,
                camera_id=camera_id,
                camera_name=camera.name,
            )

            # Log significant AI events to audit system (rate-limited)
            alerts = result.get('alerts', [])
            if alerts and ai_processor.should_log_alert():
                for alert in alerts:
                    audit_logger.log(
                        action=f'AI_{alert["alert_type"].upper()}_DETECTED',
                        result='success',
                        actor_email=principal.email,
                        actor_roles=list(principal.roles),
                        target_type='camera',
                        target_id=camera_id,
                        metadata={
                            'alert_type': alert['alert_type'],
                            'severity': alert['severity'],
                            'smart_description': alert.get('description', ''),
                        },
                    )

            descriptions = result.get('descriptions', [])
            if descriptions and ai_processor.should_log_event(camera_id):
                det_count = len(result.get('detections', []))
                face_count = len(result.get('faces', []))
                audit_logger.log(
                    action='AI_DETECTION',
                    result='success',
                    actor_email=principal.email,
                    actor_roles=list(principal.roles),
                    target_type='camera',
                    target_id=camera_id,
                    metadata={
                        'detection_count': det_count,
                        'face_count': face_count,
                        'smart_description': descriptions[0] if descriptions else '',
                    },
                )

            await websocket.send_text(json.dumps(result))
    except WebSocketDisconnect:
        logger.info('AI WebSocket disconnected: user=%s camera=%s', principal.email, camera_id)
    except Exception as exc:
        logger.error('AI WebSocket error: %s', exc)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


# ---- AI REST API Endpoints ----

@app.get('/api/v1/ai/known-faces')
def list_known_faces(
    request: Request,
    principal: Principal = Depends(get_current_principal),
) -> list[dict]:
    """List all known persons in the face recognition database."""
    face_rec = get_face_recognizer(settings.known_faces_dir, settings.ai_face_model)
    return face_rec.list_known_faces()


@app.post('/api/v1/ai/known-faces')
async def add_known_face(
    request: Request,
    name: str,
    file: UploadFile = File(...),
    principal: Principal = Depends(get_current_principal),
) -> dict:
    """Upload a new known person face image. Admin only."""
    require_role(principal, {'super_admin', 'security_admin'})

    if not file.filename:
        raise HTTPException(status_code=400, detail='No file provided')

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail='File too large')

    face_rec = get_face_recognizer(settings.known_faces_dir, settings.ai_face_model)
    result = face_rec.add_known_face(name, image_bytes, file.filename)

    audit_logger.log(
        action='AI_KNOWN_FACE_ADDED',
        result='success',
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='known_face',
        target_id=name,
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
    )

    return result


@app.delete('/api/v1/ai/known-faces/{name}')
def remove_known_face(
    request: Request,
    name: str,
    principal: Principal = Depends(get_current_principal),
) -> dict:
    """Remove a known person from the face recognition database. Admin only."""
    require_role(principal, {'super_admin', 'security_admin'})

    face_rec = get_face_recognizer(settings.known_faces_dir, settings.ai_face_model)
    removed = face_rec.remove_known_face(name)

    if not removed:
        raise HTTPException(status_code=404, detail='Person not found')

    audit_logger.log(
        action='AI_KNOWN_FACE_REMOVED',
        result='success',
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='known_face',
        target_id=name,
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
    )

    return {'status': 'removed', 'name': name}


@app.get('/api/v1/ai/settings')
def get_ai_settings(
    request: Request,
    principal: Principal = Depends(get_current_principal),
) -> dict:
    """Get current AI processing settings."""
    return ai_processor.get_settings()


@app.post('/api/v1/ai/settings')
def update_ai_settings(
    request: Request,
    body: AISettings,
    principal: Principal = Depends(get_current_principal),
) -> dict:
    """Update AI processing settings. Admin only."""
    require_role(principal, {'super_admin', 'security_admin'})

    updated_fields = body.model_dump(exclude_unset=True)
    new_settings = ai_processor.update_settings(updated_fields)

    audit_logger.log(
        action='AI_SETTINGS_CHANGED',
        result='success',
        actor_email=principal.email,
        actor_roles=list(principal.roles),
        target_type='ai_settings',
        target_id='global',
        source_ip=client_ip(request),
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
        metadata={'new_settings': updated_fields},
    )

    return new_settings


@app.get('/{path:path}', include_in_schema=False)
def catch_all(path: str) -> dict[str, str]:
    # Decoy/generic response for unknown routes.
    raise HTTPException(status_code=404, detail='Not found')
