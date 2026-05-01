# Current Research Brief

Research date: 2026-05-01

This brief records the source-backed decisions used in the plan. The final answer contains clickable citations. This repository brief summarizes the source-backed decisions for project documentation.

## Core application security sources

- OWASP ASVS 5.0: security requirements for architecture, authentication, session management, authorization, validation, logging, API security, communications, and configuration.
- OWASP Top 10 2021: broken access control, cryptographic failures, injection, insecure design, security misconfiguration, vulnerable components, authentication failures, logging failures, and SSRF are directly relevant to this project.
- OWASP API Security Top 10 2023: API1 broken object-level authorization is critical because camera IDs, stream-token IDs, audit log IDs, and user IDs must never be trusted from the client.
- OWASP Session Management Cheat Sheet: authenticated session tokens become equivalent to the authentication strength and must be protected accordingly.
- OWASP Error Handling, Authentication, HTTP Headers, CSRF, XSS, SSRF, Secrets Management, and Logging cheat sheets inform the hardening checklists.

## Identity and zero trust sources

- NIST SP 800-63B recommends phishing-resistant cryptographic authentication for high-assurance authentication. This supports passkeys or hardware security keys for admins and ideally all users.
- NIST SP 800-207 defines zero trust as no implicit trust based on network location and requires authentication and authorization before resource access.
- Cloudflare Tunnel documentation states that the origin can be connected using outbound-only tunnels with no public IP or inbound ports.
- Cloudflare Zero Trust documentation describes private application access, device enrollment, and free-plan onboarding.
- Tailscale documentation states the personal free plan permits 6 users in one tailnet as of the latest validation. This is enough for a noncommercial school MVP with 4 users, but not appropriate for production organizations.

## WebRTC and video security sources

- IETF RFC 8827 defines the WebRTC security architecture.
- IETF RFC 8826 defines the WebRTC threat model and security considerations.
- MDN getUserMedia documentation states that browser camera access requires a secure context and user permission.
- LiveKit documentation shows access tokens encode identity, room, capabilities, and permissions. This supports server-minted short-lived stream tokens rather than direct stream URLs.
- AWS Kinesis Video Streams with WebRTC documentation confirms that real-time media between camera IoT devices, browsers, and mobile devices normally needs managed signaling/media infrastructure or self-hosted equivalents.

## CCTV/IP camera sources and incident lessons

- CISA guidance and ICS advisories repeatedly recommend minimizing network exposure, keeping control/camera systems off the public internet, placing them behind firewalls, and using secure remote-access methods.
- ONVIF TLS Configuration Add-on exists because encrypted communication between ONVIF clients and devices is a key security demand.
- Verkada incident reports and FTC action show the impact of exposed support systems, privileged internal tooling, weak controls, and inadequate audit/security programs.
- Akamai and Censys writeups on CVE-2024-7029 show that end-of-life CCTV devices exposed online are actively targeted by botnets and can remain globally exposed for years.
- Recent Dahua, Hikvision, D-Link, and Honeywell security camera advisories reinforce that direct internet exposure of camera management, ONVIF, and RTSP services is unacceptable.

## Decision impact

The research directly changes the design in these ways:

1. No public app origin and no public camera ports.
2. No public registration and no public login page for the app origin.
3. Use a zero-trust or VPN gate before the web app.
4. Still enforce app-level authentication, local authorization, camera-level grants, stream-token authorization, and audit logging inside the app.
5. Use WebRTC via a controlled SFU for live feeds, not unauthenticated MJPEG/HLS/RTSP URLs.
6. Use short-lived, server-minted stream tokens with room/camera permissions.
7. Treat phone cameras as temporary camera-source identities with publish-only permission.
8. Keep future IP cameras on a dedicated camera VLAN/private network and ingest through a relay, never directly from browsers.
9. Use hash-chained audit logs and off-host export where possible.
10. Prefer free/open-source controls only when they preserve security.
