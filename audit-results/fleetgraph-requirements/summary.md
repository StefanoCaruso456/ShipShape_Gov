# FleetGraph Requirement Verification

Generated: 2026-03-18T03:08:01.611Z

## Remaining requirement status

- LangSmith shared traces: captured
- Public deployment: not_verified

## LangSmith readiness

- Tracing enabled: false
- API key present: false
- Project name: not set
- Ready for shared traces: false

## Local evidence bundle

- Evidence summary path: /Users/stefanocaruso/Desktop/Gauntlet/ShipShape/audit-results/fleetgraph-evidence/summary.json
- Shared trace count: 2

- Shared trace: https://smith.langchain.com/public/8c5e90a5-3299-47ab-90d5-c7a16583ea13/r
- Shared trace: https://smith.langchain.com/public/9f059196-346f-492d-8672-27d4400cf48b/r

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

1. LangSmith shared trace requirement is complete.
2. Deploy both API and frontend with the FleetGraph branch.
3. Rerun this verification script against the deployed URL.
4. Confirm the deployed FleetGraph routes no longer return `Cannot POST` or SPA fallback.

