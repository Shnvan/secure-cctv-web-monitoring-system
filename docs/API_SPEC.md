# API Specification

Base path: `/api/v1`

Authentication: all endpoints require a verified identity from the private access layer plus a local active user, unless explicitly marked private health check.

Error policy: use generic external errors. For unauthorized application routes, return 404 when `HIDE_AUTH_FAILURES=true` to avoid confirming app structure.

## Current user

### GET `/api/v1/me`

Returns the current local user, roles, and permitted camera IDs.

Response:

```json
{
  "id": "user-uuid",
  "email": "viewer1@example.edu",
  "roles": ["viewer"],
  "camera_ids": ["camera-1"]
}
```

## Cameras

### GET `/api/v1/cameras`

Authorization: active user. Returns only cameras the user can view or publish.

### POST `/api/v1/cameras/{camera_id}/stream-token`

Authorization: `camera.view` grant for the camera.

Request:

```json
{"purpose":"view"}
```

Response:

```json
{
  "camera_id": "camera-1",
  "room": "camera-1-room",
  "token": "short-lived-livekit-token",
  "expires_in_seconds": 60
}
```

Rules:

- Do not issue token if user disabled.
- Do not issue token if camera disabled.
- Do not issue token if grant expired.
- Token is subscribe-only.
- Audit success and denial.

### POST `/api/v1/cameras/{camera_id}/publish-token`

Authorization: `camera.publish` grant for the camera. Intended for phone camera-source users only.

Rules:

- Token is publish-only.
- Token room must match assigned camera.
- Audio disabled by default unless explicitly approved.

## Admin users

### GET `/api/v1/admin/users`

Authorization: `user.manage` or `audit.read` depending fields returned.

### POST `/api/v1/admin/users`

Authorization: `user.manage`.

Request:

```json
{
  "email": "viewer2@example.edu",
  "display_name": "Viewer 2",
  "roles": ["viewer"],
  "camera_grants": [{"camera_id":"camera-1", "action":"view"}]
}
```

### PATCH `/api/v1/admin/users/{user_id}`

Authorization: `user.manage`. Used to disable users or change grants. All changes audited.

## Audit logs

### GET `/api/v1/admin/audit-events?limit=50&cursor=...`

Authorization: `audit.read`.

Rules:

- Paginated.
- Redacted metadata by default.
- Normal viewers cannot access.
- Logs are read-only.

## Security events

### GET `/api/v1/admin/security-events`

Authorization: `audit.read` or security admin.

## Rate limits

- Token endpoints: strict per user and camera.
- Admin endpoints: strict per session.
- Failed auth/access: strict per IP and identity.
- Gateway-level rate limits should be enabled too.

## Versioning

Start with `/api/v1`. Breaking changes require `/api/v2` or explicit migration.
