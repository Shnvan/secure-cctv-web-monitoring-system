# Security Architecture

## Security posture

The system uses layered security:

1. Private network or identity-aware proxy before the app.
2. No public origin IP or camera ports.
3. Application-level identity validation.
4. Local user status and RBAC.
5. Camera-level grants.
6. Short-lived WebRTC stream tokens.
7. Hash-chained audit logs.
8. Hardened containers, reverse proxy, CORS, headers, secrets, and dependency scanning.

## Access layers

### Layer 0: No public origin

The host firewall must deny inbound traffic from the public internet. If a public hostname is required, use an outbound tunnel to the access provider. Never port-forward the origin server, database, LiveKit admin/API, RTSP, ONVIF, or camera management interfaces.

### Layer 1: Zero-trust/VPN

Allowed users and camera-source phones must authenticate before network or application access. Preferred controls:

- Passkeys or hardware security keys.
- Four-user allowlist.
- Device enrollment or posture checks.
- IP allowlist only as a secondary layer.
- Session duration limits.
- Logs exported from the access provider.

### Layer 2: App identity validation

The backend must validate a signed identity assertion from the trusted access layer. It must not blindly trust email headers unless the reverse proxy adds a shared internal signature/header and strips client-supplied identity headers.

### Layer 3: Local authorization

Even if the zero-trust layer authenticates the user, the app must check:

- User exists locally.
- User is enabled.
- User has required role.
- User has explicit camera grant.
- Session is not revoked.

### Layer 4: Stream authorization

The browser never gets raw camera credentials. The backend mints a short-lived LiveKit token only after authorization. Viewer tokens can subscribe only. Phone camera-source tokens can publish only to their assigned camera room.

## Critical deny rules

- Deny unknown identity.
- Deny disabled user.
- Deny user without camera grant.
- Deny viewer trying to publish.
- Deny camera source trying to view.
- Deny non-admin trying to manage users.
- Deny stale session.
- Deny token issuance if audit write fails.
- Deny public access to admin, database, media admin API, RTSP, ONVIF.

## Security headers

Minimum headers:

- Content-Security-Policy with exact allowed connect/media sources.
- Strict-Transport-Security when HTTPS is public/real domain.
- X-Content-Type-Options: nosniff.
- Referrer-Policy: no-referrer.
- Permissions-Policy limiting camera/microphone to publisher route only where practical.
- Frame protection with CSP frame-ancestors 'none'.
- Cache-Control: no-store for authenticated pages and API responses.

## Secrets

Secrets include:

- LiveKit API key/secret.
- Database password.
- Audit HMAC key.
- IdP/Access audience and keys.
- Cloudflare/Tailscale tokens.
- Future RTSP camera passwords.

Rules:

- No secrets in repo.
- No secrets in browser.
- No secrets in logs.
- Rotate before demo and after incident.
- Use least privilege.

## Future IP camera architecture

Real cameras should live on a dedicated camera VLAN or private subnet. They should not initiate arbitrary outbound connections unless required and approved. A relay service pulls RTSP/ONVIF from an allowlisted camera registry and republishes to LiveKit. Browser clients never contact cameras directly.
