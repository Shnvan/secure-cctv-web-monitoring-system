# Secure CCTV Web Monitoring System - Master Plan

## 1. Project Understanding

The product is a secure web-based camera monitoring platform for two live CCTV-style feeds and four authorized users. Because real CCTV hardware is not yet available, the MVP uses phone cameras as temporary camera sources. The architecture must later support IP cameras, NVRs, RTSP streams, ONVIF-compatible devices, and segmented camera networks.

The problem is controlled remote viewing of sensitive live video without exposing the application or camera feeds to normal visitors, bots, scanners, or attackers. Security is the main success criterion because the professor will act like a professional adversary. A working stream demo is not enough; unauthorized users must not discover, access, copy, replay, or bypass camera access.

Expected value:

- Authorized security staff can view live camera feeds from desktop or mobile browsers.
- Administrators can provision users, assign camera permissions, disable access, and review audit logs.
- Camera sources can publish video safely without exposing phone cameras or future CCTV devices directly.
- The system demonstrates production-grade secure design, testing, and documentation.

Primary success criteria:

1. No public registration.
2. No public origin server exposure.
3. No direct camera stream URLs.
4. Strong identity before app access.
5. Deny-by-default authorization.
6. Short-lived stream tokens.
7. Complete audit logging.
8. Hardened deployment and test evidence.
9. Clear failure behavior for offline cameras and expired sessions.
10. Ready for adversarial evaluation.

Key assumptions are listed in Section 4.

## 2. Additional Expert Roles Needed

| Role | Why needed | Decisions influenced | Risks reduced |
|---|---|---|---|
| Product Manager | Keep MVP small and defensible | Scope, priorities, acceptance criteria | Feature creep, demo failure |
| Software Architect | Define secure system boundaries | Backend, frontend, APIs, components | Insecure or unmaintainable architecture |
| Cybersecurity Architect | Lead threat model and controls | Auth, authorization, logging, hardening | Breach during evaluation |
| Network Security Engineer | Design private access and camera segmentation | VPN, zero trust, VLANs, firewall rules | Exposed services, lateral movement |
| Video Streaming Engineer | Choose and secure streaming path | WebRTC, SFU, phone source, future RTSP relay | Stream leakage, high latency, broken video |
| QA Engineer | Prove requirements work | Test cases, regression, edge cases | Untested bypasses and demo defects |
| DevOps Engineer | Build repeatable deployment | Docker, CI/CD, secrets, TLS | Misconfiguration, manual mistakes |
| SRE Engineer | Plan monitoring and recovery | Health checks, alerting, backups | Silent outage, audit loss |
| Cloud Architect | Keep cloud usage secure and cost-aware | Tunnels, private network, hosting | Overexposure and unnecessary spend |
| Database Architect | Design durable, auditable schema | Data model, constraints, retention | Data corruption and weak evidence |
| Privacy Specialist | Reduce privacy harm from video | Data minimization, retention, masking | Sensitive footage exposure |
| Compliance Specialist | Align to institutional expectations | Logging, access control, policies | Missing governance evidence |
| Technical Writer | Make project reviewable | Admin guide, user guide, demo guide | Poor handoff and unclear operation |

## 3. Clarifying Questions

### Business goals

- Is this a demo-only school deployment or a real institutional pilot?
- Is remote access required outside campus, or can all access remain private-network-only?
- Is a public domain required by the professor?

### Users

- Who are the four users and which roles do they need?
- Are users allowed to access from personal devices?
- Should users be restricted by location or device posture?

### Camera sources

- Which phones will publish video?
- Are phones dedicated camera devices or users' personal phones?
- Will audio be disabled by default?

### Security

- Will the professor test only the web app, or also the network and deployment?
- Is social engineering in scope?
- Are managed accounts/passkeys available?

### Access control

- Should every viewer see both cameras, or only specific feeds?
- Who may disable users and view audit logs?
- Is emergency access needed?

### Network access

- Can Tailscale, Cloudflare Zero Trust, or an institutional VPN be used?
- Is the school network NAT/firewall friendly for WebRTC UDP?
- Can camera phones run a VPN client?

### Compliance and privacy

- Will footage show people or sensitive areas?
- Are recordings required? If yes, what retention applies?
- Is consent signage required?

### Recording and storage

- Is live-only acceptable for MVP?
- Are snapshots allowed?
- Should exports be disabled until production hardening?

### Live streaming

- What latency is acceptable?
- How many viewers can watch a camera simultaneously?
- Is full-screen mode needed?

### Infrastructure

- Is there a server, laptop, or mini PC for hosting?
- Can Docker be used?
- Is a domain available?

### Budget

- Is zero monthly cost required for the school demo?
- Is paid ZTNA acceptable for real institutions later?
- Can hardware security keys be purchased?

### Operations

- Who owns admin duties?
- Who reviews logs?
- Who handles incident response?

### Testing

- Will a test report be graded?
- Can automated tests be run before demo?
- Can the professor receive a test account instead of attacking blind?

### Penetration testing

- Is the test white-box, gray-box, or black-box?
- Are denial-of-service tests allowed?
- Are third-party services out of scope?

Proceeding assumptions are below.

## 4. Assumptions

| Assumption | Reason | Risk if wrong | How to validate |
|---|---|---|---|
| MVP supports 2 camera feeds | User requirement | Capacity and UI may be underbuilt | Confirm feed count before build |
| MVP supports 4 authorized users | User requirement | Access plan may not fit if users grow | Confirm user list |
| Responsive web app only | User requirement | Mobile native features unavailable | Browser tests on Android/iOS |
| Phone cameras are temporary sources | Real CCTV unavailable | Phone battery/network issues | Test long-running phone publish |
| Future IP cameras required | User requirement | Wrong streaming abstraction | Design camera source interface |
| No public registration | Security requirement | Account creation abuse | Confirm with professor |
| Unknown visitors should not see real app | Security requirement | Public login reveals target | Use private network or decoy behavior |
| Security over convenience | Explicit requirement | Usability friction | Get acceptance from users |
| Audit logging required | Explicit requirement | Missing forensic evidence | Implement and test audit logs |
| Skilled attacker will test | Explicit requirement | Weak controls fail | Run pentest checklist |
| Budget exists but spend wisely | User request | Free tier limitations | Track cost and risks |
| Built from scratch | Existing assets none | More work | Create repo and docs |
| Live-only MVP is acceptable | Reduces sensitive storage | Professor may expect playback | Ask, but keep recording out until approved |
| Audio disabled by default | Privacy and lower risk | User may expect audio | Confirm before demo |
| Cloud/on-prem credentials unavailable here | Environment limitation | Cannot complete real deployment | Provide manual steps |

## 5. Product Requirements

### Must-have

- Authorized users can view permitted live camera feeds.
- Phone camera source can publish a feed after authentication/authorization.
- Admin-controlled provisioning only.
- Deny-by-default RBAC and camera-level access rules.
- No public registration.
- No direct camera feed URLs.
- Short-lived stream authorization tokens.
- Strong outer access gate: private zero-trust network, VPN, or identity-aware proxy.
- Generic 404 or no route for unauthorized/unknown visitors.
- Audit logs for login, logout, failed access, stream access, admin actions, permission changes, session activity, and blocked requests.
- Security headers, strict CORS, CSRF protection where cookies are used, rate limits, input validation, and safe error handling.
- Camera offline and stream error handling.
- Automated tests for critical authz paths.
- Deployment guide and pentest checklist.

### Should-have

- Passkeys or hardware-security-key MFA.
- Device posture check or managed-device requirement.
- IP allowlist as an extra layer, not the only layer.
- Log export to append-only/off-host storage.
- Stream health monitoring.
- Admin dashboard for audit review.
- Session revocation and global logout.
- Suspicious login/access alerts.

### Could-have

- Motion detection.
- Privacy masks.
- Watermarking.
- Snapshots.
- Incident report generation.
- Camera tamper detection.
- NVR integration.

### Not needed for MVP

- Public self-signup.
- Recording/playback.
- Public marketing homepage.
- AI analytics.
- Face recognition.
- PTZ control.
- Emergency break-glass access.
- Multi-tenant customer support tooling.

## 6. Recommended Feature Set

| Feature | Recommendation | Reason | Security impact | Complexity | MVP priority |
|---|---|---|---|---|---|
| Live camera viewing | Include | Core product | Must be token protected | Medium | Must |
| Multi-camera dashboard | Include for 2 feeds | Demo value | Enforce per-camera permission | Low | Must |
| Full-screen view | Include | Usability | No extra feed URL | Low | Should |
| Camera status | Include | Operational clarity | Reveals only to authorized users | Low | Must |
| Motion detection | Delay | Not core | Adds data and false alerts | Medium | Later |
| Recording/playback | Reject for MVP | Increases privacy and storage risk | High sensitive-data risk | High | Later |
| Snapshots | Delay | Can leak images | Needs export policy | Medium | Later |
| RBAC | Include | Core security | High positive | Medium | Must |
| Audit logs | Include | Required | High positive | Medium | Must |
| Login history | Include | Detect abuse | Medium positive | Low | Should |
| Session management | Include | Prevent stale access | High positive | Medium | Must |
| Device trust | Include if ZTNA supports it | Reduces stolen credential risk | High positive | Medium | Should |
| IP allowlisting | Add as secondary | Useful but brittle | Medium positive | Low | Should |
| MFA/passkeys | Include | Strong auth | High positive | Medium | Must |
| Admin dashboard | Include minimal | Needed for users/logs | Must restrict | Medium | Must |
| Alerting | Minimal | Detect attacks | Positive | Medium | Should |
| Tamper detection | Delay | Needs real cameras | Positive later | Medium | Later |
| Camera offline detection | Include | Demo reliability | Positive | Low | Must |
| Stream health | Include basic | Debug video | Positive | Medium | Should |
| Privacy masking | Delay | Needs real locations | Positive later | Medium | Later |
| Watermarking | Delay | Deters screenshots | Partial control | Medium | Later |
| Export logs | Include admin-only | Evidence | Must redact | Low | Should |
| Incident reports | Template only | Helps review | Positive | Low | Could |
| Emergency access | Reject MVP | Dangerous bypass | Negative if weak | High | No |
| Account lockout | Include adaptive | Stops brute force | Avoid DoS lockout | Medium | Must |
| Suspicious login detection | Include minimal | Attack detection | Positive | Medium | Should |

## 7. User Roles and Permissions

Default rule: deny by default. A user has no camera or admin permission unless explicitly granted.

| Role | Allowed actions | Blocked actions | Camera access | Admin access | Audit visibility | Restrictions |
|---|---|---|---|---|---|---|
| Super Admin | Provision users, assign roles, configure cameras, view all logs | Cannot bypass audit, cannot access raw secrets | Explicit grants still recorded | Full MVP admin | Full | Passkey required, least number of users |
| Security Admin | Manage camera access, disable viewers, review security events | Cannot change system secrets or delete logs | As assigned | Limited | Security and access logs | Passkey required |
| Viewer | View assigned live feeds, view own session history | No admin, no user management, no audit export | Assigned cameras only | None | Own events only | No publish unless separate grant |
| Auditor | Read audit logs and reports | No stream viewing unless separately granted | None by default | None | Read-only logs | No changes allowed |
| Camera Source | Publish one assigned phone feed | Cannot view feeds or admin | Publish-only camera | None | Own publish events | Dedicated account/device |

For the MVP, use Super Admin, Viewer, Auditor optional, and Camera Source. Security Admin can be merged into Super Admin for a four-user demo if it reduces complexity.

## 8. User Stories and Acceptance Criteria

| Story | Priority | Acceptance criteria | Edge cases | Security considerations | QA notes |
|---|---|---|---|---|---|
| As a viewer, I want to view a live camera feed so that I can monitor an area. | Must | Assigned camera appears; stream starts only after token issuance; access is audited. | Camera offline, token expired, slow network. | Token is short-lived and camera-scoped. | Test assigned and unassigned cameras. |
| As a user, I want to log in securely so that only my identity is accepted. | Must | Access requires ZTNA/IdP and app user exists. | Disabled user, wrong device, no MFA. | Passkey/MFA required. | Verify no local public signup. |
| As an attacker, I should fail safely when login is invalid. | Must | Generic response; event logged; rate limited. | Repeated failures. | No user enumeration. | Check timing and messages. |
| As an unknown visitor, I should not see the app. | Must | No route or generic 404. | Direct endpoint guessing. | Origin not exposed. | Test from non-member device. |
| As an auditor, I want to view logs so that I can investigate activity. | Should | Logs searchable and read-only. | Large logs. | Redaction and hash chain. | Verify viewer cannot modify logs. |
| As an admin, I want to create users so that access is controlled. | Must | Admin-only; user disabled until roles/grants set. | Duplicate email. | Audit action. | Test non-admin denied. |
| As an admin, I want to disable users so that access can be revoked. | Must | Existing sessions/stream tokens invalidated quickly. | User currently viewing. | Session revocation. | Test active stream cutoff. |
| As a viewer, I want camera offline state shown clearly. | Must | UI displays offline without exposing internals. | Frozen stream. | No stack traces. | Simulate publisher stop. |
| As a user, I want idle sessions to expire. | Must | Idle timeout and absolute timeout enforced. | Viewer watching long stream. | Refresh requires reauth. | Test expired token and session. |
| As a user, I want MFA/passkey flow. | Must | IdP/passkey enforced before app. | Lost key. | Recovery is admin-controlled. | Test account recovery policy. |
| As an admin, I want suspicious access detection. | Should | Repeated failures and unusual IP/device changes logged. | NAT changes. | Avoid privacy overcollection. | Test alert thresholds. |

## 9. Recommended MVP

MVP goal: A secure, live-only, two-camera web monitoring system with four pre-provisioned users, phone-camera publishers, zero public registration, private access, strict RBAC, short-lived WebRTC tokens, and audit logs.

MVP includes:

- Responsive dashboard.
- Two camera cards.
- Phone publisher page for each camera source.
- LiveKit/WebRTC stream flow.
- App backend token broker.
- Local RBAC and camera grants.
- Admin provisioning via deployment-time seed script or admin-only endpoint.
- Hash-chained audit logs.
- Security headers and generic errors.
- Automated authz tests.
- Docker deployment files.

MVP excludes recording, public registration, playback, snapshots, PTZ, AI analytics, public direct stream URLs, and emergency bypass.

MVP success metrics:

- Unauthorized device cannot reach the app.
- Unauthorized identity receives no useful page.
- Viewer cannot access unassigned camera.
- Copied stream token expires quickly.
- Disabled user loses access.
- Audit log records all sensitive actions.
- No camera source credentials are exposed to browser viewers.
- Basic automated tests pass.

Launch risks:

- WebRTC network traversal fails on school network.
- Phone battery or browser permission interrupts feed.
- Free-tier ZTNA limits change.
- Misconfiguration accidentally publishes ports.
- IdP/passkey setup incomplete.

## 10. System Architecture

Text diagram:

```text
Authorized user device
  -> private zero-trust/VPN client or identity-aware proxy
  -> reverse proxy with TLS/security headers
  -> frontend web app
  -> backend API token broker
  -> Postgres database and audit log
  -> LiveKit/WebRTC SFU
  -> phone camera publisher

Future IP camera path:
IP camera or NVR on camera VLAN
  -> camera ingest relay/RTSP bridge
  -> LiveKit/WebRTC SFU
  -> authorized viewers through token broker
```

Component responsibilities:

- Frontend: authenticated UI only; never stores secrets; requests stream token per camera.
- Backend: validates identity, enforces RBAC, mints short-lived LiveKit tokens, logs all security events.
- Identity-aware proxy/ZTNA: blocks unknown devices/users before app access.
- LiveKit SFU: receives phone publisher stream and sends media to authorized subscribers.
- Database: users, roles, cameras, grants, sessions, audit logs, token records, config.
- Reverse proxy: TLS termination, security headers, request size limits, optional mTLS, no directory listing.
- Camera ingest relay: future RTSP/ONVIF integration without exposing camera credentials to browsers.

Data flow:

1. User authenticates at ZTNA/IdP.
2. Request reaches backend with verified identity assertion.
3. Backend checks local user state and camera permissions.
4. Backend creates short-lived, camera-scoped LiveKit token.
5. Browser connects to LiveKit using token.
6. LiveKit enforces room permissions.
7. Backend logs token issuance and camera access.

Failure handling:

- Unauthorized: generic 404 or no route.
- Disabled user: revoke session and deny future token issuance.
- Camera offline: show offline state and log health event.
- Database outage: fail closed for token issuance.
- Audit failure: fail closed for admin actions and token issuance unless explicitly in emergency read-only mode.

Backup and recovery:

- Postgres daily encrypted backup for config and audit metadata.
- No video recordings in MVP.
- Separate offline copy of deployment config without secrets.
- Rotate all secrets after suspected compromise.

## 11. Access Architecture Decision

| Option | Pros | Cons | Security strength | Usability | Cost | Complexity | Suitability |
|---|---|---|---|---|---|---|---|
| Public internet with normal login | Easy | Exposes target and login | Low | High | Low | Low | Reject |
| Public internet with hidden/decoy | Better than normal login | Still public attack surface | Medium | Medium | Low | Medium | Only if required |
| VPN-only | Hides app from internet | Requires client | High | Medium | Free/low | Medium | Strong MVP choice |
| Zero-trust identity-aware proxy | Identity before app | May show provider challenge if public | High | Medium/high | Free/low for small use | Medium | Strong choice |
| IP allowlisting | Simple extra layer | Weak with mobile/dynamic IPs | Medium alone, good as layer | Low/medium | Free | Low | Secondary only |
| mTLS | Strong device identity | Certificate operations | High | Lower | Free | Medium/high | Good for admins/services |
| Internal network only | Very strong if physical only | No remote access | High | Low/medium | Free | Low | Best if remote access not needed |

Recommendation:

- School MVP: private-network-only access using Tailscale or Cloudflare Zero Trust private network, plus app-level RBAC. No public DNS. No public login page.
- If a browser-accessible public domain is mandatory: Cloudflare Tunnel plus Access or equivalent, strict identity allowlist, passkeys/MFA, origin IP hidden, WAF/rate limits, and app-level authorization. This is acceptable but less stealthy than private-network-only because the access challenge may reveal an application exists.
- Production: managed ZTNA with IdP, device posture, hardware keys/passkeys, log export to SIEM, camera VLAN, and dedicated TURN/SFU design.

## 12. Technology Stack Recommendation

| Layer | Recommendation | Alternatives | Security implications |
|---|---|---|---|
| Frontend | React + TypeScript + Vite | Next.js, SvelteKit | Small static app; no server secrets |
| Backend | FastAPI + Python | NestJS, Go | Type hints, simple API token broker |
| Database | PostgreSQL | SQLite for local only | Strong constraints, audit durability |
| Cache/queue | None for MVP | Redis later | Avoid extra moving parts |
| Auth gate | ZTNA or identity-aware proxy | Public local login | Identity before origin access |
| App auth | Verified proxy/JWT identity + local RBAC | Password-only | Avoids public password login |
| MFA | Passkeys/security keys through IdP | TOTP fallback | Phishing resistance preferred |
| Streaming | LiveKit OSS WebRTC SFU | Janus, mediasoup, Kinesis Video | Server-minted tokens and no direct URLs |
| Reverse proxy | Caddy or Nginx | Traefik | TLS and headers |
| Hosting | Local mini PC/laptop for MVP | Low-cost VPS later | No public ports for MVP |
| CI/CD | GitHub Actions | GitLab CI | Free security checks |
| Security scans | Semgrep, pip-audit, npm audit, Trivy, Gitleaks | Snyk paid | Free baseline coverage |
| Monitoring | Prometheus/Grafana or simple logs | Cloud SIEM later | Local for MVP, SIEM for production |
| Secrets | `.env` local only, sealed secret later | Hardcoded secrets | Never commit secrets |

## 13. Video Streaming Design

| Method | Pros | Cons | Latency | Security risks | Complexity | Browser support | MVP fit | Future CCTV fit |
|---|---|---|---|---|---|---|---|---|
| WebRTC | Low latency, browser native | Needs signaling/SFU/TURN | Very low | Token/signaling misuse | Medium | Strong | Best | Good via relay |
| HLS | Simple playback | Higher latency | 5-30s | Segment URL leakage | Medium | Strong | Not ideal | Good for playback later |
| RTSP relay | Common for IP cameras | Browser cannot play directly | Low | Credential leakage | Medium | Poor direct | Future ingest only | Strong |
| MJPEG | Simple | Inefficient, easier URL leakage | Low/medium | Direct URL abuse | Low | Good | Reject for secure MVP | Poor |
| Direct browser camera | Simple phone capture | No multi-viewer scaling | Low | Requires secure signaling | Low/medium | Good | Source side only | Not for IP cameras |
| Phone-as-camera | No hardware needed | Battery, permissions, network | Low | Publisher account compromise | Medium | Good | Required | Temporary |

Recommended MVP:

- Use phone browser `getUserMedia` to capture video.
- Phone publishes to LiveKit room as a camera-source identity.
- Viewer receives a subscribe-only token for assigned camera room.
- Backend is the only component that mints tokens.
- Tokens are short-lived, room-scoped, role-scoped, and logged.
- Audio disabled by default.
- Future IP cameras connect through a private RTSP/ONVIF relay that republishes to LiveKit. Browser viewers never receive RTSP credentials.

## 14. Data Model and Database Design

See `docs/DATABASE_SCHEMA.sql` for the executable starter schema.

Main entities:

- Users: identity, status, roles, MFA/passkey metadata references.
- Roles and permissions: deny-by-default role mapping.
- Cameras: camera metadata, status, source type, room name.
- Camera grants: explicit user-camera actions such as view, publish, manage.
- Sessions: user session metadata and revocation state.
- Stream tokens: issued token metadata, expiry, purpose, and revocation status.
- Audit logs: append-only security events with hash chain.
- Security events: alert-worthy events derived from audit logs.
- System configuration: security settings and retention.

Privacy:

- Do not store raw video in MVP.
- Do not log stream content.
- Do not log raw tokens or secrets.
- Redact IP/device fields in exports unless needed for security review.

## 15. API Design

See `docs/API_SPEC.md`.

Principles:

- All API routes require authenticated identity except health endpoints that are private-network-only.
- Authorization is checked per object, not only per role.
- No endpoint returns camera credentials, RTSP URLs, LiveKit API secrets, or raw IdP tokens.
- Stream tokens expire quickly and are scoped to one room and capability.
- Admin endpoints require admin role and fresh session.
- Pagination required for audit logs.
- All errors use safe generic messages externally and detailed correlation IDs internally.

## 16. Security Plan

Assets:

- Live camera feeds.
- User identities and sessions.
- Camera source publisher identities.
- Stream tokens.
- Database and audit logs.
- Deployment secrets.
- Future camera credentials.

Attacker profiles:

- Internet scanner.
- Curious student.
- Credential-stuffing bot.
- Skilled professor/pentester.
- Malicious insider viewer.
- Compromised user device.
- Compromised phone camera source.

Trust boundaries:

- Public internet to ZTNA/VPN.
- ZTNA to reverse proxy.
- Reverse proxy to backend.
- Backend to database.
- Backend to LiveKit token service.
- Camera source to LiveKit.
- Future camera VLAN to ingest relay.

Controls:

- SQL injection: parameterized queries/ORM, validation, least-privileged DB user.
- XSS: React escaping, CSP, no unsafe HTML, output encoding.
- CSRF: SameSite cookies, CSRF tokens for cookie-auth admin actions, or bearer/proxy auth with strict origins.
- IDOR: object-level checks on every camera, user, token, and audit endpoint.
- Auth bypass: ZTNA plus verified signed identity plus local enabled user check.
- Authorization bypass: deny-by-default policy and tests.
- Brute force: IdP protections, rate limits, generic errors, alerts.
- Session hijacking: secure cookies, short idle timeout, revocation, device/IP change logging.
- Token theft: short-lived tokens, no localStorage for app secrets, redacted logs.
- Direct stream access: no unauthenticated URLs; LiveKit token required.
- SSRF: backend never fetches arbitrary user URLs; future RTSP relays use allowlisted private camera registry.
- CORS: exact origins only, no wildcard credentials.
- Admin panel exposure: only behind private access and admin role.
- Logs: redact secrets, append-only, hash chain, restrict access.
- Secrets: env/secrets manager only, no repo commits, rotation plan.
- Dependencies: lockfiles and scans.
- Containers: non-root, read-only where possible, no privileged containers, CIS Docker guidance.
- Infrastructure: no exposed DB/camera ports, firewall deny inbound by default.
- Backups: encrypted and access controlled.
- Incident response: disable users, rotate secrets, preserve audit chain, rebuild from clean image.

## 17. Audit Logging and Monitoring Plan

Log events:

- Authentication success/failure.
- ZTNA identity missing/invalid.
- User creation/modification/disable.
- Role and permission changes.
- Camera create/update/disable.
- Stream token issuance/denial/revocation.
- Camera publish start/stop.
- Camera view start/stop.
- Unauthorized camera access attempts.
- Admin actions.
- Session creation/expiration/revocation.
- IP/device/browser changes.
- Rate-limit triggers and blocked requests.
- Configuration changes.
- Audit chain verification failures.

Required fields:

- Event ID, timestamp, actor user ID, actor identity, role, source IP, user agent hash, action, target type, target ID, result, reason code, correlation ID, session ID, request ID, previous hash, event hash.

Never log:

- Passwords.
- Passkey private material.
- MFA seeds or backup codes.
- Raw stream tokens.
- LiveKit API secrets.
- Camera RTSP credentials.
- Full video frames.

Retention:

- MVP: 90 days local, export before demo.
- Production: 180-365 days depending institution policy.

Integrity:

- Hash-chain every audit event.
- Restrict write path to backend service.
- Export off-host where possible.
- Alert on chain verification failure.

## 18. QA and Testing Plan

Test layers:

- Unit tests: policy decisions, token expiry, audit hashing.
- API tests: auth required, object-level authorization, admin-only endpoints.
- UI tests: dashboard, offline state, session expiry.
- Streaming tests: phone publish, viewer subscribe, token expiry, camera offline.
- Security tests: SQLi strings, XSS payloads as data, CSRF behavior, CORS, headers.
- Performance tests: 2 phones, 4 viewers, sustained 30 minutes.
- Accessibility tests: keyboard navigation and readable status.
- Regression tests: critical authz suite on every commit.

Specific required tests:

- Unauthorized visitor cannot access app.
- Unauthorized visitor cannot access camera stream.
- Expired session cannot access stream.
- Disabled user cannot access stream.
- Viewer cannot access admin panel.
- Copied stream token fails after expiration.
- Failed logins are logged.
- Successful access is logged.
- Admin actions are logged.
- Camera offline behavior works.
- Audit logs cannot be modified by normal users.

## 19. Penetration Test Readiness Plan

Likely attack paths:

- Search for public ports and origin IP.
- Visit domain expecting login page.
- Force-browse API routes.
- Change camera IDs in requests.
- Replay or copy stream tokens.
- Attempt viewer-to-admin escalation.
- Abuse CORS/WebSocket origins.
- Try injection payloads in camera/user names.
- Steal or reuse session cookies.
- Access LiveKit directly.
- Search repo for secrets.
- Exploit container or reverse-proxy misconfig.

Defensive checklist:

- No public ports except approved ZTNA edge if used.
- Origin firewall denies inbound public traffic.
- All test users have MFA/passkeys.
- No public registration or reset flow.
- Stream tokens expire and are scoped.
- Database, LiveKit, and admin routes are private.
- Security headers present.
- CORS exact allowlist.
- Dependency scans clean or documented.
- Gitleaks/trufflehog clean.
- Logs prove blocked attempts.
- Demo accounts use least privilege.

## 20. DevOps and Deployment Plan

Environments:

- Local dev: loopback/private network only, dev auth allowed only here.
- Demo: private ZTNA/VPN, real IdP, dev auth disabled.
- Production future: managed ZTNA, SIEM, hardened host, managed backups.

Pipeline:

1. Lint and type check.
2. Unit/API tests.
3. Dependency audit.
4. Secret scan.
5. Container scan.
6. Build images.
7. Deploy to private host.
8. Run smoke tests.
9. Verify security headers and blocked access.
10. Backup config and export test evidence.

Secrets:

- Store in `.env` only for local MVP.
- Use secrets manager or sealed files later.
- Rotate before demo and after test.
- Never share API keys in slides/screenshots.

Monitoring:

- App health checks.
- LiveKit connection metrics.
- Audit event volume.
- Failed access alerts.
- Disk usage alerts.
- Certificate expiry alerts.

## 21. Execution Roadmap

| Phase | Goals | Tasks | Deliverables | Owner | Dependencies | Risks | Completion criteria |
|---|---|---|---|---|---|---|---|
| 0 Discovery | Validate scope | Confirm access model, users, devices | Scope notes | PM/Security | Stakeholders | Wrong assumptions | Signed MVP scope |
| 1 Architecture | Lock security design | Threat model, diagrams, stack | Security architecture | Architect | Phase 0 | Over/underengineering | Design reviewed |
| 2 Repo/Infra | Build skeleton | Docker, CI, env, docs | Starter repo | DevOps | Phase 1 | Secrets mistakes | Pipeline runs |
| 3 Auth/RBAC | Protect app | ZTNA, identity validation, RBAC | Auth module | Security/Backend | IdP | Bypass | Authz tests pass |
| 4 Streaming | Prove video | Phone publisher, LiveKit, token broker | Live demo feed | Video Eng | Network | NAT issues | 2 feeds work |
| 5 Admin/Audit | Manage access | User grants, logs, export | Admin and audit | Backend | DB | Log gaps | Audit tests pass |
| 6 Hardening | Reduce attack surface | Headers, rate limits, scans | Hardened config | Security/DevOps | App ready | Misconfig | Checklist pass |
| 7 QA | Validate | Functional/security/perf tests | Test report | QA | Stable build | Edge bugs | Critical tests pass |
| 8 Pentest prep | Prepare evaluation | Checklist, backups, demo accounts | Pentest pack | Security | QA | Missed exposure | Dry run pass |
| 9 Demo/docs | Present | Guides, script, slides outline | Demo kit | Tech Writer | Working MVP | Demo failure | Rehearsal pass |
| 10 Future | Production plan | Recording, real cameras, SIEM | Roadmap | Architect | MVP | Scope growth | Approved backlog |

## 22. Task Breakdown

| ID | Task | Role | Priority | Estimate | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|---|
| P-001 | Confirm MVP scope and users | PM | Must | S | None | Scope recorded |
| A-001 | Create threat model | Security Architect | Must | M | P-001 | Threat model approved |
| A-002 | Decide access model | Network Security | Must | M | P-001 | No-public-origin decision documented |
| D-001 | Create repo and Docker skeleton | DevOps | Must | M | A-002 | Compose starts locally |
| B-001 | Implement identity validation | Backend | Must | M | A-002 | Invalid identity denied |
| B-002 | Implement RBAC/camera grants | Backend | Must | M | B-001 | IDOR tests pass |
| B-003 | Implement stream token endpoint | Backend | Must | M | B-002 | Token scoped and logged |
| B-004 | Implement audit hash chain | Backend | Must | M | DB schema | Tamper detected |
| F-001 | Build camera dashboard | Frontend | Must | M | B-003 | Two camera cards |
| F-002 | Build phone publisher page | Frontend | Must | M | LiveKit | Phone publishes |
| V-001 | Configure LiveKit | Video Eng | Must | M | D-001 | Private room works |
| S-001 | Add security headers | Security Eng | Must | S | Reverse proxy | Headers verified |
| S-002 | Configure rate limits | Security Eng | Should | S | Proxy/backend | Abuse limited |
| Q-001 | Write authz API tests | QA | Must | M | B-002 | Critical tests pass |
| Q-002 | Write stream expiry tests | QA | Must | M | B-003 | Expired token fails |
| Q-003 | Perform browser/mobile test | QA | Must | M | F-002 | Android/iOS notes |
| O-001 | Write deployment guide | DevOps | Must | S | A-002 | Reproducible steps |
| O-002 | Write admin guide | Tech Writer | Should | S | B/F ready | Admin can operate |
| O-003 | Write demo script | Tech Writer | Should | S | Working demo | Rehearsal succeeds |
| SEC-001 | Run secret scan | Security | Must | S | Repo | No secrets found |
| SEC-002 | Run dependency scans | Security | Must | S | Dependencies | Findings triaged |
| SEC-003 | Run pre-pentest checklist | Security | Must | M | QA | No critical gaps |

## 23. Risk Register

| Risk | Category | Severity | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|---|
| Origin exposed publicly | Security | Critical | Medium | Full compromise attempt | Tunnel/VPN only, firewall scans | DevOps |
| Public login reveals target | Security | High | Medium | Recon advantage | Private DNS or decoy route | Network Security |
| Stream token copied | Security | High | Medium | Unauthorized viewing | Short TTL, room scope, revocation | Backend |
| IDOR on camera ID | Security | Critical | Medium | View wrong camera | Object-level tests | Backend/QA |
| Phone disconnects | Streaming | Medium | High | Demo failure | Power, Wi-Fi, reconnect UI | Video Eng |
| WebRTC blocked by network | Streaming | High | Medium | No video | Test early, TURN/private VPN | Video Eng |
| Audit logging incomplete | Security | High | Medium | No evidence | Required log tests | Backend/QA |
| Secrets committed | Security | Critical | Low/Medium | Credential compromise | Gitleaks, env templates | DevOps |
| Admin account compromised | Security | Critical | Medium | Full app control | Passkeys, least admin count | Security |
| Free tier changes | Cost | Medium | Low/Medium | Unexpected cost | Have Tailscale/Cloudflare alternatives | PM |
| Overbuilt MVP | Product | Medium | Medium | Late delivery | Exclude recording/AI/PTZ | PM |
| Underbuilt security | Security | Critical | Medium | Fails pentest | Follow checklist | Security |
| Database outage | Operational | Medium | Low | Fail closed | Backups and health checks | SRE |
| Audit disk full | Operational | High | Medium | Logging failure | Disk alerts, retention | SRE |
| Future IP camera vulnerable | Security | High | Medium | Pivot or leak | Camera VLAN, no internet exposure | Network Security |

## 24. Edge Cases and Failure Scenarios

| Scenario | Expected behavior | Detect | Test | Recover |
|---|---|---|---|---|
| Phone camera disconnects | Viewer sees offline/reconnecting | Stream health event | Close phone tab | Reopen publisher |
| Stream freezes | UI marks stale after timeout | Last frame timestamp | Network throttle | Restart publisher |
| Latency increases | Show degraded status | WebRTC stats | Packet loss test | Reduce resolution |
| Network drops | Session remains but token may expire | Connection lost event | Disable Wi-Fi | Reauth if needed |
| Session expires while viewing | Stream stops or refresh denied | Session expiry log | Short TTL test | Reauthenticate |
| User disabled while viewing | Token revoked, future subscribe denied | Admin event | Disable active viewer | Force logout |
| Stream token expires | Copied token fails | Token denial log | Reuse token | Request new authorized token |
| Unauthorized visits domain | No route/404/no DNS | Block log | External device test | None |
| Attacker scans endpoints | Rate limit and generic errors | WAF/backend logs | Safe scanner | Tune limits |
| Database outage | Fail closed for sensitive actions | Health check | Stop DB | Restore DB |
| Audit logging fails | Fail closed for admin/token actions | Audit write error | Simulate disk full | Restore disk/log sink |
| Disk full | Stop writes, alert | Disk monitor | Fill test volume | Clean/expand disk |
| Reverse proxy fails | App unavailable, no bypass | Health check | Stop proxy | Restart/rollback |
| TLS cert expires | Access blocked, alert before expiry | Cert monitor | Check expiry | Renew cert |
| MFA device lost | Admin-controlled recovery | Support event | Recovery drill | Rebind passkey |
| Admin targeted | Alerts and rate limits | Failed attempts | Test wrong auth | Lock/rotate |
| Browser blocks camera permission | Publisher UI explains fix | Error event | Deny permission | Grant permission |
| Mobile browser sleeps | Feed stops safely | Heartbeat missed | Lock phone | Keep screen awake/dedicated device |
| Camera source IP changes | No issue if identity based | Session metadata | Switch network | Reauth if policy requires |

## 25. Execution

Created in this repository:

- Product requirements document and master plan.
- Research brief.
- Security architecture and diagram.
- Database schema.
- API specification.
- Threat model.
- Security checklist.
- Audit logging specification.
- QA test plan.
- Penetration-test readiness checklist.
- Backend starter code.
- Frontend starter code.
- Docker/LiveKit/Caddy scaffolding.
- CI security workflow.
- Environment template.
- Deployment/admin/user/demo guides.

Blocked here because external resources are unavailable:

- Real Cloudflare/Tailscale/IdP setup.
- Real domain/DNS configuration.
- Real phone camera browser permissions.
- Real server firewall configuration.
- Real hardware security keys.
- Real CCTV/IP cameras or NVRs.
- Production SIEM/log export.

Manual next steps:

1. Choose Tailscale or Cloudflare Zero Trust for demo access.
2. Create four user identities and enforce passkeys/MFA.
3. Configure private hostname and reverse proxy.
4. Generate LiveKit API key/secret and put them in secrets storage.
5. Start Docker deployment on a private host.
6. Test two phone publishers and four viewers.
7. Run the QA and pentest readiness checklists.
8. Export evidence for demo.

## 26. Validation

Current design meets the key requirements on paper and in starter scaffolding:

- Unauthorized access is blocked before app and denied inside app.
- Camera stream access uses token broker, not direct URLs.
- RBAC and camera grants are deny-by-default.
- Audit logging is specified and scaffolded with a hash chain.
- Common web attacks are addressed by design and tests.
- MVP is realistic for two feeds/four users.
- Future IP cameras are supported through relay abstraction.

Remaining validation before demo:

- Run the app with real ZTNA/IdP identity.
- Confirm no public origin ports are reachable.
- Confirm LiveKit is private or token-only and not broadly exposed.
- Run automated tests and manual mobile tests.
- Verify audit log integrity after test actions.
- Rotate all demo secrets.

What could still fail during the professor's test:

- A misconfigured tunnel or exposed Docker port.
- Weak IdP/MFA setup.
- Dev auth accidentally left enabled.
- Incomplete Cloudflare Access JWT validation.
- LiveKit ports reachable outside intended network.
- CORS set to wildcard.
- Hardcoded secrets in repo or screenshots.
- Token TTL too long.
- Missing object-level check in a new endpoint.

## 27. Final Deliverables

Planned:

- Complete product, security, technical, testing, deployment, and demo plan.

Executed:

- Created repository scaffold and documentation pack.
- Created starter backend and frontend code.
- Created Docker, LiveKit, Caddy, environment, CI, and testing scaffolds.

Human approval still needed:

- Final access model: private VPN/ZTNA versus public Access challenge.
- Actual IdP and MFA method.
- Whether recording is out of scope.
- Whether phone publishers are dedicated devices.
- Whether audit logs are exported off-host for demo.

Must complete before penetration testing:

- Real ZTNA/VPN setup.
- Real identity validation with dev auth disabled.
- Secret scan and dependency scan.
- Network exposure scan.
- Full QA suite.
- Demo dry run.

Must complete before production:

- Managed device posture.
- SIEM/log export.
- Backups and disaster recovery.
- Formal incident response runbook.
- Real camera VLAN and ingest relay.
- Privacy/legal review.
- Hardware key policy.

## 28. Final Recommendation

Status: Ready to design and ready to start building the MVP. Not ready for security testing, demo, or production until the manual deployment, identity, secret, scan, and QA steps are completed.

Why:

- The architecture is security-first and avoids public origin exposure.
- The MVP scope is small and defensible.
- Stream access is designed around short-lived authorization, not direct URLs.
- The repository contains concrete starter deliverables.
- The highest remaining risks are deployment and identity configuration, not product concept.
