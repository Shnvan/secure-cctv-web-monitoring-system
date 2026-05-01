from __future__ import annotations

from fastapi import HTTPException, Request, status
import jwt
from jwt import PyJWKClient

from .audit import audit_logger
from .models import Principal, CameraAction
from .settings import settings

# Demo in-memory users. Replace with database access before production.
USERS: dict[str, Principal] = {
    'security-admin@example.edu': Principal(
        id='user-security-admin',
        email='security-admin@example.edu',
        roles=['super_admin'],
        camera_grants={'camera-1': ['view', 'publish', 'manage'], 'camera-2': ['view', 'publish', 'manage']},
    ),
    'admin@example.edu': Principal(
        id='user-admin',
        email='admin@example.edu',
        roles=['super_admin'],
        camera_grants={'camera-1': ['view', 'manage'], 'camera-2': ['view', 'manage']},
    ),
    'viewer1@example.edu': Principal(
        id='user-viewer1',
        email='viewer1@example.edu',
        roles=['viewer'],
        camera_grants={'camera-1': ['view']},
    ),
    'viewer2@example.edu': Principal(
        id='user-viewer2',
        email='viewer2@example.edu',
        roles=['viewer'],
        camera_grants={'camera-2': ['view']},
    ),
    'camera1@example.edu': Principal(
        id='user-camera1',
        email='camera1@example.edu',
        roles=['camera_source'],
        camera_grants={'camera-1': ['publish']},
    ),
    'camera2@example.edu': Principal(
        id='user-camera2',
        email='camera2@example.edu',
        roles=['camera_source'],
        camera_grants={'camera-2': ['publish']},
    ),
}


def _safe_deny(request: Request, reason: str) -> None:
    audit_logger.log(
        action='ACCESS_DENIED',
        result='denied',
        reason_code=reason,
        source_ip=request.client.host if request.client else None,
        user_agent=request.headers.get('user-agent'),
        request_id=request.headers.get('x-request-id'),
    )
    code = status.HTTP_404_NOT_FOUND if settings.hide_auth_failures else status.HTTP_403_FORBIDDEN
    raise HTTPException(status_code=code, detail='Not found' if code == 404 else 'Forbidden')


def _email_from_cloudflare_access_jwt(token: str) -> str:
    if not settings.cloudflare_access_jwks_url or not settings.cloudflare_access_audience:
        raise ValueError('Cloudflare Access JWT validation is not configured')
    jwks_client = PyJWKClient(settings.cloudflare_access_jwks_url)
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=['RS256'],
        audience=settings.cloudflare_access_audience,
    )
    email = claims.get('email')
    if not email:
        raise ValueError('JWT missing email claim')
    return str(email).lower()


def _email_from_trusted_proxy_header(request: Request) -> str | None:
    if not settings.trusted_proxy_secret:
        return None
    supplied_secret = request.headers.get('x-internal-auth-secret')
    if supplied_secret != settings.trusted_proxy_secret:
        return None
    email = request.headers.get(settings.trusted_identity_header)
    return email.lower() if email else None


def get_current_principal(request: Request) -> Principal:
    email: str | None = None

    if settings.dev_auth_enabled and settings.environment == 'dev':
        email = request.headers.get('x-dev-user')
    else:
        cf_token = request.headers.get('cf-access-jwt-assertion')
        if cf_token:
            try:
                email = _email_from_cloudflare_access_jwt(cf_token)
            except Exception:
                _safe_deny(request, 'invalid_access_jwt')
        if not email:
            email = _email_from_trusted_proxy_header(request)

    if not email:
        _safe_deny(request, 'missing_identity')

    principal = USERS.get(email.lower())
    if not principal:
        _safe_deny(request, 'unknown_local_user')
    if principal.disabled:
        _safe_deny(request, 'disabled_user')

    return principal


def require_role(principal: Principal, roles: set[str]) -> None:
    if not set(principal.roles).intersection(roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden')


def require_camera_grant(principal: Principal, camera_id: str, action: CameraAction) -> None:
    allowed = principal.camera_grants.get(camera_id, [])
    if action not in allowed and 'super_admin' not in principal.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden')
