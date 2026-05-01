from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    app_name: str = 'Secure CCTV Web Monitoring System'
    environment: str = 'dev'
    dev_auth_enabled: bool = False
    hide_auth_failures: bool = True

    allowed_origins: str = 'https://cctv.internal'

    # Identity-aware proxy validation. Prefer signed JWT validation.
    cloudflare_access_jwks_url: str | None = None
    cloudflare_access_audience: str | None = None

    # Optional trusted reverse proxy identity header mode. Only use when the proxy
    # strips inbound client identity headers and adds x-internal-auth-secret.
    trusted_identity_header: str = 'x-auth-request-email'
    trusted_proxy_secret: str | None = None

    livekit_url: str = 'wss://livekit.internal'
    livekit_api_key: str | None = None
    livekit_api_secret: str | None = None
    stream_token_ttl_seconds: int = 60

    audit_hmac_key: str

    rate_limit_window_seconds: int = 60
    rate_limit_max_requests: int = 60


settings = Settings()
