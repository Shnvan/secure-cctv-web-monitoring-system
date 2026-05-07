# Secure CCTV Web Monitoring System

## Project Overview

The Secure CCTV Web Monitoring System is a security-first school MVP for private, browser-based live camera monitoring. It is designed to demonstrate how a CCTV-style web application can avoid public exposure while still enforcing application-level identity, authorization, stream-token control, and audit logging.

The project supports two phone/browser camera publishers, a dashboard viewer, administrative security pages, and audit-log review. The intended demo model is private access through Tailscale Serve, with the backend receiving a real identity from a trusted private access layer.

## Security Goals

- Keep the application, camera publisher pages, backend API, LiveKit media service, database, and camera management surfaces off the public internet.
- Require private-network access before the browser can reach the app.
- Validate user identity again inside the backend instead of trusting the frontend.
- Enforce roles and camera-specific grants before issuing stream tokens.
- Avoid public registration and self-signup.
- Use short-lived LiveKit tokens instead of exposing raw camera URLs or long-lived media credentials.
- Record important allowed and denied security events in audit logs.
- Make the demo understandable for review, grading, and security discussion.

## Architecture Summary

```text
Browser or phone on Tailscale
  -> Tailscale Serve private HTTPS endpoint
  -> Local Caddy reverse proxy on port 8080
  -> React frontend
  -> FastAPI backend API
  -> LiveKit WebRTC server
  -> PostgreSQL service for the intended persistent data layer
```

Caddy serves the frontend and reverse proxies API and LiveKit WebSocket traffic. The backend validates the trusted identity passed from the private access layer, checks local roles and camera grants, and only then mints short-lived LiveKit stream or publish tokens.

For the current demo, users and audit state are implemented as starter in-memory data in the backend. PostgreSQL and the database schema are included as the intended persistent data layer for production hardening.

## Tech Stack

- Frontend: React, TypeScript, Vite, browser-native dark CCTV dashboard UI
- Backend: FastAPI, Pydantic settings, PyJWT
- Media: LiveKit WebRTC
- Reverse proxy: Caddy
- Database service: PostgreSQL
- Private access: Tailscale and Tailscale Serve
- Containers: Docker Compose
- CI security checks: GitHub Actions, `pip-audit`, `npm audit`, Gitleaks, backend tests

## Features Implemented

- Private access through Tailscale Serve.
- Real Tailscale/private-access identity passed to the backend through trusted proxy identity header mode.
- Role and camera-grant authorization.
- No public registration or self-signup flow.
- Short-lived LiveKit stream tokens and publish tokens.
- Two camera publisher routes:
  - `http://localhost:8080/publisher?camera=camera-1`
  - `http://localhost:8080/publisher?camera=camera-2`
- Dashboard viewer at `http://localhost:8080`.
- Frontend-derived camera live status detection: offline, connecting, waiting, live, reconnecting, disconnected, and error.
- Admin security page at `/admin/security`.
- Audit logs page at `/admin/audit-logs` with hash-chain integrity status.
- Publisher lifecycle audit events:
  - `CAMERA_PUBLISHER_STARTED`
  - `CAMERA_PUBLISHER_STOPPED`
  - `CAMERA_PUBLISHER_DISCONNECTED`
  - `CAMERA_PUBLISHER_FAILED`
- Admin users page at `/admin/users`.
- Simulated denied-access audit event at `/admin/security-test`.
- GitHub Actions security workflow for backend tests, Python dependency audit, frontend dependency audit, and secret scanning.

## Local Development Setup

Install these prerequisites:

- Docker Desktop or Docker Engine with Docker Compose
- Node.js if running the frontend outside Docker
- Python 3.12 if running the backend outside Docker
- Tailscale for private-device demo access

Create a local `.env` from your private deployment values. The `.env` file must stay local and private.

Create a local `infra/livekit.yaml` with LiveKit key settings that match your private local environment. The real `infra/livekit.yaml` file must stay local and private.

Do not commit `.env`, `infra/livekit.yaml`, known-face images, API secrets, Tailscale keys, database passwords, LiveKit secrets, camera credentials, or stream tokens into documentation, screenshots, issues, or commits.

Useful local URLs after Docker Compose starts:

- Dashboard: `http://localhost:8080`
- Camera 1 publisher: `http://localhost:8080/publisher?camera=camera-1`
- Camera 2 publisher: `http://localhost:8080/publisher?camera=camera-2`
- Admin security: `http://localhost:8080/admin/security`
- Audit logs: `http://localhost:8080/admin/audit-logs`
- Admin users: `http://localhost:8080/admin/users`
- Security test: `http://localhost:8080/admin/security-test`

## Tailscale Private Access Setup

For the demo, the preferred model is to keep the app reachable only inside a Tailscale tailnet.

1. Install Tailscale on the host running Docker.
2. Install Tailscale on viewer devices and phone camera-source devices.
3. Sign all demo devices into the same tailnet.
4. Use Tailscale ACLs so only approved users and camera-source devices can reach the app.
5. Do not port-forward the app, database, LiveKit API, RTSP, ONVIF, or camera management interfaces to the public internet.
6. Use the backend trusted identity mode only behind a proxy that strips untrusted inbound identity headers and injects trusted identity headers itself.

For a real production deployment, use institution-approved zero-trust access, device posture checks, hardware-backed MFA, external log export, hardened hosts, and a full security review.

## Run With Docker Compose

Start the full local stack:

```bash
docker compose up --build
```

Follow logs:

```bash
docker compose logs -f
```

Stop the stack:

```bash
docker compose down
```

Caddy listens on `127.0.0.1:8080` for local access. LiveKit media ports are bound to the configured local or Tailscale IP according to `docker-compose.yml`.

## Run Tailscale Serve

After Docker Compose is running locally, publish the local Caddy service privately to your tailnet:

```bash
tailscale serve --bg http://127.0.0.1:8080
```

Check Serve status:

```bash
tailscale serve status
```

Disable Serve when the demo is done:

```bash
tailscale serve reset
```

The private URL depends on your Tailscale machine name and tailnet. Share only the private Tailscale URL with approved demo users.

## Demo Flow

1. Explain the security-first requirement: no public CCTV web app exposure.
2. Start Docker Compose.
3. Start Tailscale Serve.
4. Open the dashboard through local access or the private Tailscale URL.
5. Open Camera 1 publisher on one phone or browser tab.
6. Open Camera 2 publisher on a second phone or browser tab.
7. Start publishing both camera feeds.
8. On the dashboard, click one camera and show status changes from offline to connecting, waiting, and live.
9. Click View all and show both camera feeds working independently.
10. Open `/admin/audit-logs`, refresh logs, and show `CAMERA_PUBLISHER_STARTED`.
11. Stop a publisher and show the dashboard status moving away from live.
12. Refresh audit logs and show `CAMERA_PUBLISHER_STOPPED`.
13. If practical, close a publisher unexpectedly or trigger a publisher failure and show `CAMERA_PUBLISHER_DISCONNECTED` or `CAMERA_PUBLISHER_FAILED`.
14. Open `/admin/security` and show the authenticated identity, roles, and camera grants.
15. Open `/admin/users` and show that users are provisioned, not self-registered.
16. Open `/admin/security-test` and generate a simulated denied-access event.
17. Open `/admin/audit-logs`, refresh logs, and show hash-chain integrity.

Do not show `.env`, API secrets, private keys, raw LiveKit tokens, camera credentials, or private user data during the demo.

## Security Controls

- Private access first through Tailscale Serve.
- Backend identity validation from a trusted private access layer.
- Local role checks for admin, viewer, auditor, and camera-source behavior.
- Camera-specific grants before view or publish token issuance.
- No public user registration.
- Short-lived LiveKit stream and publish tokens.
- Generic denial behavior to avoid revealing unnecessary details.
- Security headers configured through Caddy.
- Hash-chained audit log events for tamper-evidence in the demo.
- Publisher start, stop, disconnect, and failure activity is recorded as audit events.
- Simulated denied-access event for safe audit demonstration.
- GitHub Actions security checks for dependencies, tests, and secret scanning.

## Limitations / Future Work

- Demo users and audit events are currently starter in-memory backend data; production should persist users, roles, grants, token records, and audit events in PostgreSQL.
- Local deployment values are intentionally not distributed with the repository.
- Tailscale Serve is suitable for a small private demo, not a complete enterprise CCTV deployment by itself.
- Production should add durable audit export, backups, monitoring, alerting, incident response procedures, and host hardening.
- Production should use managed identity, phishing-resistant MFA, device posture checks, and formal access reviews.
- Camera onboarding, camera health checks, audit pagination, log export, and admin user management workflows should be expanded.
- External penetration testing and threat-model review should happen before any real institutional use.

## Troubleshooting

### Docker port 8080 is already in use

Stop the process using port `8080`, or change the Caddy port mapping in `docker-compose.yml` for local development.

### Browser camera permission is denied

Allow camera access in the browser for the publisher page. If using a phone, verify the page is opened through a browser that supports camera capture and WebRTC.

### Publisher is open but the dashboard stays waiting

Confirm the correct publisher URL is open for the same camera ID. Use `camera-1` for Camera 1 and `camera-2` for Camera 2. Keep the publisher tab open and the device awake.

### LiveKit connection fails

Check `docker compose logs -f livekit backend caddy`. Verify the LiveKit URL and API key/secret values in local environment configuration match the LiveKit server configuration.

### Tailscale Serve is not reachable from another device

Run `tailscale serve status`, confirm both devices are in the same tailnet, and check Tailscale ACLs. Also verify Docker Compose is running and `http://127.0.0.1:8080` works on the host.

### Admin pages return access denied

Use an identity with the required admin or auditor role. The backend only allows known provisioned users and denies unknown, disabled, or underprivileged users.

### Audit logs are empty

Generate activity first. For example, view a camera, start or stop a publisher, request a stream token, or use `/admin/security-test` to create the simulated denied-access audit event.

### GitHub Actions security checks fail

Review the failing job. Dependency audit failures usually require upgrading a package. Gitleaks failures usually mean a secret-like value was committed and must be removed, rotated, and kept out of git history.
