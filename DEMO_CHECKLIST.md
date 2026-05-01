# Secure CCTV Demo Checklist

Use this checklist before and during the Secure CCTV Web Monitoring System demo. Do not show or share secrets during the demo. The local `.env` file must stay private and local.

## Docker Startup Checklist

- [ ] Docker Desktop or Docker Engine is running.
- [ ] The project has a local `.env` with private deployment values.
- [ ] `.env` is not committed, shared, screenshotted, or opened during the demo.
- [ ] From the project repo folder, start the stack:

```bash
docker compose up --build
```

- [ ] In another terminal, follow logs if needed:

```bash
docker compose logs -f
```

- [ ] Confirm the local dashboard opens at `http://localhost:8080`.
- [ ] Confirm no public ports are intentionally exposed beyond the local/private demo setup.

## Tailscale Startup Checklist

- [ ] Host laptop/server is connected to the correct Tailscale tailnet.
- [ ] Phone camera device 1 is connected to the same tailnet.
- [ ] Phone camera device 2 is connected to the same tailnet.
- [ ] Approved viewer/admin devices are connected to the same tailnet.
- [ ] Start Tailscale Serve from the host running Docker:

```bash
tailscale serve --bg http://127.0.0.1:8080
```

- [ ] Confirm Serve is active:

```bash
tailscale serve status
```

- [ ] Approved viewers use only the private Tailscale URL.
- [ ] The app is not advertised as a public internet URL.

## Phone Camera Publisher Checklist

- [ ] On phone/browser 1, open `/publisher?camera=camera-1` through the local or private Tailscale URL.
- [ ] On phone/browser 2, open `/publisher?camera=camera-2` through the local or private Tailscale URL.
- [ ] Allow browser camera permission on both publisher devices.
- [ ] Keep both publisher tabs open.
- [ ] Keep phone screens awake and battery charged.
- [ ] Click Start publishing on Camera 1.
- [ ] Click Start publishing on Camera 2.
- [ ] Verify both publisher pages report that they are publishing.

## Dashboard Test Checklist

- [ ] Open the dashboard at `http://localhost:8080` or through the private Tailscale URL.
- [ ] Confirm camera cards initially show `offline`.
- [ ] Click View feed on one camera.
- [ ] Confirm that camera status changes from `offline` to `connecting`, then `waiting`, then `live`.
- [ ] Click View all.
- [ ] Confirm both camera feeds can run at the same time.
- [ ] Confirm each camera card updates independently.
- [ ] Stop or close one publisher tab.
- [ ] Confirm the affected dashboard camera status changes away from `live`.

## Admin Security Page Test

- [ ] Open `/admin/security`.
- [ ] Confirm the page shows the authenticated identity.
- [ ] Confirm roles are visible.
- [ ] Confirm camera grants are visible.
- [ ] Explain that backend authorization still checks roles and camera grants after private access.

## Audit Logs Test

- [ ] Open `/admin/audit-logs`.
- [ ] Confirm audit events appear after camera viewing, token requests, or security-test activity.
- [ ] Confirm hash-chain integrity status is visible.
- [ ] Refresh audit logs after generating a new event.

## Users Page Test

- [ ] Open `/admin/users`.
- [ ] Confirm provisioned users are listed.
- [ ] Confirm roles are listed.
- [ ] Confirm camera grants are listed.
- [ ] Explain that public registration and self-signup are not part of the system.

## Security Test Page Test

- [ ] Open `/admin/security-test`.
- [ ] Click Generate denied-access test event.
- [ ] Confirm the page reports that the simulated event was written.
- [ ] Open `/admin/audit-logs`.
- [ ] Refresh audit logs.
- [ ] Confirm the simulated denied-access event is visible.

## Non-Tailscale Unauthorized Access Test

- [ ] Use a device or network path that is not connected to the tailnet.
- [ ] Confirm the private Tailscale URL is unreachable from that device/path.
- [ ] Confirm there is no public app URL being used for the demo.
- [ ] Confirm there is no public registration page.
- [ ] Explain that private access is the first security boundary, and backend authorization is the second boundary.

## GitHub Actions Green Check

- [ ] Open the repository Actions tab.
- [ ] Confirm the `security-checks` workflow is green.
- [ ] Confirm backend tests pass.
- [ ] Confirm `pip-audit` passes.
- [ ] Confirm `npm audit --audit-level=high` passes.
- [ ] Confirm Gitleaks secret scanning passes.

## Common Troubleshooting Fixes

### Docker port 8080 is already in use

- [ ] Stop the process using port `8080`, or temporarily change the local Caddy port mapping for development.

### Docker services fail to start

- [ ] Run `docker compose logs -f`.
- [ ] Restart Docker Desktop if containers are stuck.
- [ ] Rebuild with `docker compose up --build`.

### Tailscale Serve URL is not reachable

- [ ] Run `tailscale serve status`.
- [ ] Confirm the host is connected to Tailscale.
- [ ] Confirm the viewer device is in the same tailnet.
- [ ] Confirm `http://127.0.0.1:8080` works on the host.

### Camera permission is denied

- [ ] Allow camera access in the browser.
- [ ] Reload the publisher page.
- [ ] Use a browser that supports WebRTC camera capture.

### Publisher is open but dashboard stays waiting

- [ ] Confirm Camera 1 uses `/publisher?camera=camera-1`.
- [ ] Confirm Camera 2 uses `/publisher?camera=camera-2`.
- [ ] Confirm Start publishing was clicked.
- [ ] Keep the phone awake and publisher tab open.

### LiveKit or WebRTC connection failure

- [ ] Check `docker compose logs -f livekit backend caddy`.
- [ ] Confirm LiveKit service is running.
- [ ] Confirm the browser can reach the private app URL.
- [ ] Refresh the dashboard and publisher pages.

### Admin page access denied

- [ ] Use an approved admin, security admin, or auditor identity for admin-only pages.
- [ ] Confirm the private access layer is passing the expected authenticated identity.
- [ ] Confirm the user is provisioned in the backend demo user list.

### Audit logs are empty

- [ ] View a camera or request a stream token.
- [ ] Use `/admin/security-test` to generate a simulated denied-access event.
- [ ] Refresh `/admin/audit-logs`.

### GitHub Actions dependency audit or secret scan fails

- [ ] Review the failing workflow step.
- [ ] Upgrade vulnerable dependencies if an audit fails.
- [ ] If secret scanning fails, remove the secret-like value, rotate the secret if it was real, and keep secrets out of the repo.
