# Admin Guide

## Admin rules

- Use a hardware security key or passkey.
- Do not share admin accounts.
- Do not create public registration.
- Do not grant all cameras unless needed.
- Disable users immediately when no longer needed.
- Review audit logs after every demo/test.
- Rotate secrets after a suspected compromise.

## User provisioning

1. Create or confirm the user in the IdP/ZTNA allowlist.
2. Create the local user in the app.
3. Assign the least role required.
4. Assign explicit camera grants.
5. Confirm MFA/passkey enrollment.
6. Ask the user to test access.
7. Check audit log.

## Camera-source phone provisioning

1. Create a dedicated camera-source identity.
2. Assign `camera_source` role.
3. Grant `publish` only for one camera.
4. Open the publisher page from the private network.
5. Grant browser camera permission.
6. Keep phone plugged in and screen awake for demo.

## Incident actions

- Disable affected user.
- Revoke sessions.
- Rotate LiveKit and app secrets if token service may be compromised.
- Export audit logs.
- Preserve evidence.
- Rebuild host from known-good images if host compromise suspected.
