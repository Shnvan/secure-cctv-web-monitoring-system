# Audit Logging Specification

## Goals

- Prove who accessed which camera and when.
- Prove denied access attempts.
- Prove admin changes.
- Support incident response.
- Detect tampering through a hash chain.

## Event categories

- AUTH_SUCCESS
- AUTH_FAILURE
- ACCESS_BLOCKED
- SESSION_CREATED
- SESSION_EXPIRED
- SESSION_REVOKED
- CAMERA_VIEW_TOKEN_ISSUED
- CAMERA_VIEW_DENIED
- CAMERA_PUBLISH_TOKEN_ISSUED
- CAMERA_PUBLISH_DENIED
- CAMERA_ONLINE
- CAMERA_OFFLINE
- USER_CREATED
- USER_UPDATED
- USER_DISABLED
- ROLE_CHANGED
- CAMERA_GRANT_CHANGED
- CONFIG_CHANGED
- RATE_LIMITED
- AUDIT_CHAIN_VERIFICATION_FAILED

## Fields

Required:

- `id`
- `occurred_at`
- `actor_user_id` if known
- `actor_email` if known
- `actor_roles`
- `action`
- `target_type`
- `target_id`
- `result`
- `reason_code`
- `source_ip`
- `user_agent_hash`
- `session_id`
- `request_id`
- `correlation_id`
- `metadata`
- `previous_hash`
- `event_hash`

## Hash-chain construction

`event_hash = HMAC_SHA256(AUDIT_HMAC_KEY, canonical_json(event_without_event_hash) + previous_hash)`

Rules:

- Store `previous_hash` from the last committed event.
- Do not allow normal admins to edit audit rows.
- Export logs periodically off-host.
- Verify chain during startup and before demo.

## Redaction

Never log:

- Raw passwords.
- Raw MFA secrets.
- Raw stream tokens.
- LiveKit API secrets.
- Camera RTSP credentials.
- Full camera frames.
- Full cookies.
- Authorization headers.

## Alert-worthy events

- Repeated denied camera token requests.
- Failed admin access.
- User disabled while active.
- Stream token requested from new device/IP.
- Audit chain verification failure.
- Dev auth enabled in non-dev environment.
- LiveKit API errors during active camera use.
- Disk capacity warning.
