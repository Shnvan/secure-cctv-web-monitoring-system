# Deployment Guide

## MVP private deployment

1. Prepare a laptop, mini PC, or VM that will host Docker.
2. Install Docker and Docker Compose.
3. Put the host behind a private access layer:
   - Option A: Tailscale tailnet for noncommercial school demo.
   - Option B: Cloudflare Zero Trust private network / Access.
   - Option C: institutional VPN.
4. Do not open public inbound firewall ports.
5. Copy `private local configuration` to `.env` and replace every secret.
6. Start services with `docker compose up --build`.
7. Configure private DNS or private hostname.
8. Disable `DEV_AUTH_ENABLED` before demo.
9. Configure real identity assertion validation.
10. Run the pentest checklist.

## Firewall rules

- Public inbound: deny all.
- Private ZTNA/VPN inbound: allow reverse proxy and LiveKit media ports only as needed.
- Database: allow backend container only.
- Future camera VLAN: allow ingest relay to camera RTSP/ONVIF only.

## Cloudflare Access notes

- Use an allowlist of exact user emails/groups.
- Enforce IdP MFA/passkeys.
- Validate Access JWT at the backend.
- Do not expose origin IP.
- Consider whether an Access challenge page violates the no-public-login requirement.

## Tailscale notes

- Good for zero-cost noncommercial school demo with a small user count.
- Use ACLs so only users and camera-source devices can reach the app/media server.
- Do not use personal/free plan for a real company/government production deployment.

## Production improvements

- Managed ZTNA with device posture.
- SIEM log export.
- Managed backup.
- Hardware security keys.
- Separate camera VLAN and firewall.
- Hardened host baseline.
- External security review.
