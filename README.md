# Secure CCTV Web Monitoring System

Security-first starter repository and planning pack for a school MVP that is treated as if it will be used by sensitive institutions.

## Most important design decision

Do not expose the application server, database, LiveKit server, camera ingest pages, RTSP ports, ONVIF ports, or camera management interfaces directly to the public internet.

For the MVP, place every service behind a private zero-trust network or VPN and then enforce application-level authorization again inside the app. This repository supports an identity-aware reverse proxy or Cloudflare Access style JWT as the outer identity layer, plus local RBAC and camera-level permissions inside the backend.

## What is included

- Full project plan: `docs/MASTER_PLAN.md`
- Research brief and source map: `docs/RESEARCH_BRIEF.md`
- Security architecture: `docs/SECURITY_ARCHITECTURE.md`
- Threat model: `docs/THREAT_MODEL.md`
- Database schema: `docs/DATABASE_SCHEMA.sql`
- API specification: `docs/API_SPEC.md`
- Audit logging specification: `docs/AUDIT_LOGGING_SPEC.md`
- QA and pentest readiness: `docs/QA_TEST_PLAN.md`, `docs/PENTEST_READINESS_CHECKLIST.md`
- Deployment, admin, user, and demo guides
- Mermaid architecture diagram: `architecture/secure-cctv-architecture.mmd`
- Backend FastAPI starter code with deny-by-default RBAC, stream-token authorization, generic 404 behavior, security headers, and hash-chained audit logging
- Frontend React starter code for camera viewing and phone-as-camera publishing
- Docker, Caddy, LiveKit, and CI security workflow scaffolding

## Recommended MVP access model

Preferred for zero cost school demo:

1. Private zero-trust network or VPN for the 4 users and 2 camera-source phones.
2. No public DNS record for the app.
3. No public login page.
4. App reachable only through private address or private hostname.
5. Backend still validates identity and local RBAC before issuing any stream token.
6. LiveKit media server reachable only through the private network, never as an unauthenticated public URL.

Acceptable if a public domain is mandatory:

1. Cloudflare Tunnel plus Cloudflare Access or equivalent identity-aware proxy.
2. No exposed origin IP.
3. Strict allowlist of four identities.
4. Phishing-resistant MFA/passkeys at the IdP.
5. App-level RBAC, short-lived stream tokens, and full audit logging.
6. Be aware that an Access challenge page can reveal that something exists. If the professor requires no visible login at all, use private-network-only access instead.

## Run locally for development only

```bash
create a local .env
# Edit secrets in .env before any serious test.
docker compose up --build
```

The included default configuration is not a production deployment. Before penetration testing, complete the checklist in `docs/PENTEST_READINESS_CHECKLIST.md`.

## Security warning

Never commit `.env`, private keys, LiveKit API secrets, database passwords, Cloudflare tokens, Tailscale auth keys, camera credentials, or real stream URLs. Never publish raw camera feeds or RTSP credentials to the browser.
