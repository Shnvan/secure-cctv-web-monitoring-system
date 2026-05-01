# QA Test Plan

## Functional tests

- Viewer can see assigned camera.
- Viewer cannot see unassigned camera.
- Admin can create and disable users.
- Camera source can publish assigned feed.
- Camera source cannot view feeds.
- Auditor can read logs but cannot view feeds by default.
- Offline camera shows offline state.

## Negative security tests

- No identity header/JWT returns generic 404.
- Unknown identity returns generic 404.
- Disabled user cannot call any sensitive API.
- Viewer cannot access admin routes.
- Viewer cannot mint publish token.
- Camera source cannot mint view token.
- User cannot modify camera ID to access another camera.
- Expired token cannot join room.
- Old copied token fails after TTL.
- Wildcard CORS is not enabled.
- Security headers are present.
- Secrets are not present in repo.

## Stream tests

- One phone publishes camera 1.
- One phone publishes camera 2.
- Four viewers subscribe simultaneously.
- Phone loses network and reconnects.
- Browser permission denied displays safe guidance.
- Mobile screen lock behavior documented.
- 30-minute sustained test.

## Performance acceptance for MVP

- Two 720p feeds or lower if school network is weak.
- Four simultaneous viewers.
- Token issuance under 500 ms on local network.
- UI camera status updates within 10 seconds.

## Release readiness

- Critical authz tests pass.
- No public exposed ports in scan.
- Dev auth disabled.
- Strong secrets set.
- ZTNA/VPN allows only four users and two camera devices.
- Audit events verified.
- Demo dry run completed.
