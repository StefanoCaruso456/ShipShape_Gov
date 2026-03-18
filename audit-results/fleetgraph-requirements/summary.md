# FleetGraph Requirement Verification

Generated: 2026-03-18T02:14:01.330Z

## Remaining requirement status

- LangSmith shared traces: blocked_by_env
- Public deployment: not_verified

## LangSmith readiness

- Tracing enabled: false
- API key present: false
- Project name: not set
- Ready for shared traces: false

## Public deployment verification

### https://dev.ship.awsdev.treasury.gov

- App reachable: true (status 200)
- Health endpoint: true (status 200)
- FleetGraph on-demand route: route_missing (status 404)
- FleetGraph proactive route: route_missing (status 404)

### https://shadow.ship.awsdev.treasury.gov

- App reachable: true (status 200)
- Health endpoint: true (status 200)
- FleetGraph on-demand route: spa_fallback (status 200)
- FleetGraph proactive route: spa_fallback (status 200)

## Objective next steps

1. Export LangSmith tracing env vars before rerunning the evidence harness.
2. Deploy both API and frontend with the FleetGraph branch.
3. Rerun this verification script against the deployed URL.
4. Confirm the deployed FleetGraph routes no longer return `Cannot POST` or SPA fallback.

