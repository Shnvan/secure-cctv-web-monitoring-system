# Security Policy

This is a school project scaffold. Do not deploy it to production without completing the production hardening checklist.

## Reporting vulnerabilities

Report issues privately to the project owner or instructor. Do not test third-party systems. All testing must be authorized.

## High-risk mistakes to avoid

- Publicly exposing the origin server.
- Leaving `DEV_AUTH_ENABLED=true` outside local development.
- Publishing LiveKit, RTSP, ONVIF, Postgres, or admin ports publicly.
- Committing secrets.
- Adding public registration.
- Returning raw camera URLs or credentials to the frontend.
- Skipping object-level camera authorization checks.
