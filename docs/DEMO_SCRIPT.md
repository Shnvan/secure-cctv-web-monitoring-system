# Demo Script

## Before demo

- Verify private access is enabled.
- Verify dev auth is disabled.
- Verify two phones publish successfully.
- Verify viewer sees only assigned cameras.
- Verify unassigned camera access is denied.
- Verify admin actions appear in audit logs.
- Verify no public origin exposure.

## Demo flow

1. Explain security-first requirement and no-public-origin decision.
2. Show architecture diagram.
3. Show four pre-provisioned users and no registration page.
4. Log in as viewer and view assigned camera.
5. Try to access unassigned camera and show safe denial plus audit log.
6. Show phone publisher feed.
7. Disable viewer as admin.
8. Confirm viewer can no longer mint stream token.
9. Show audit log entries and hash-chain verification result.
10. Show pentest checklist and remaining production improvements.

## Do not show

- `.env` values.
- LiveKit API secret.
- Camera credentials.
- Raw tokens.
- Real user private data.
