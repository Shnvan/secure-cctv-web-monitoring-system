from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('Referrer-Policy', 'no-referrer')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        response.headers.setdefault('Cache-Control', 'no-store')
        response.headers.setdefault('Permissions-Policy', 'camera=(self), microphone=()')
        response.headers.setdefault(
            'Content-Security-Policy',
            "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; "
            "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "connect-src 'self' wss://livekit.internal https://livekit.internal; media-src 'self' blob:",
        )
        return response
