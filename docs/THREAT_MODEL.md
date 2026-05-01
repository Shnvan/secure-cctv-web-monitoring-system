# Threat Model

## Scope

In scope:

- Web app.
- Backend API.
- Identity assertion handling.
- Camera permissions.
- Stream token issuance.
- Phone camera publisher flow.
- LiveKit/SFU access design.
- Database schema.
- Audit logging.
- Docker deployment.
- Reverse proxy.

Out of scope for MVP but planned:

- Real CCTV hardware firmware security.
- NVR vendor cloud accounts.
- Long-term video recording storage.
- Physical tampering with cameras.

## Assets

| Asset | Sensitivity | Impact if compromised |
|---|---|---|
| Live video feeds | Critical | Privacy breach and project failure |
| Stream tokens | High | Temporary unauthorized viewing |
| User identities | High | Account takeover |
| Admin privileges | Critical | Full system control |
| Audit logs | High | Loss of evidence |
| LiveKit API secret | Critical | Unauthorized media token minting |
| Database | High | User/grant/log exposure |
| Camera credentials future | Critical | Camera takeover |

## Attack surfaces

- Public DNS and tunnel edge.
- Reverse proxy.
- API routes.
- WebSocket/WebRTC signaling.
- LiveKit media ports.
- Phone publisher route.
- Admin routes.
- CI/CD and repo.
- Environment variables and logs.
- Database network.
- Future RTSP/ONVIF relay.

## Abuse cases and defenses

| Abuse case | Defense |
|---|---|
| Attacker visits domain | Private network or generic 404; no origin exposure |
| Attacker guesses `/admin` | ZTNA plus RBAC; generic denial; logged |
| Viewer changes camera ID | Object-level camera grant check |
| Viewer copies stream token | Short TTL, room-scoped token, revocation |
| Camera source tries to view | Publish-only role |
| Compromised viewer account | MFA/passkeys, least privilege, audit, revocation |
| Compromised admin | Hardware key/passkey, minimum admin count, monitoring |
| SQL injection | Parameterized queries, validation, least privilege |
| XSS | CSP, output encoding, no unsafe HTML |
| CSRF | SameSite/CSRF token for cookie admin actions |
| SSRF to RTSP relay | Allowlisted camera registry, no arbitrary URLs |
| Exposed LiveKit | Private network/firewall, token auth, no admin API exposure |
| Logs tampered | Hash chain, restricted writes, off-host export |
| Secrets leaked | Secret scan, rotation, no browser secrets |

## Security invariants

- A user cannot view a camera unless a `camera_grants` record permits `view`.
- A phone cannot publish unless it has a `publish` grant for exactly one camera.
- A user cannot manage users unless it has admin permissions.
- A stream token cannot outlive its TTL.
- An expired/disabled/revoked session cannot mint new tokens.
- An audit event must be written for every allowed or denied stream token request.
- Unknown identities receive no useful application page.
