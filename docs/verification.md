# MVP verification

Verified on Windows with Node 24 and PostgreSQL 18, October 14, 2026. All request tests targeted the disposable test backend supplied with this project, never an existing user backend.

## Passed

- Strict TypeScript compilation.
- Vite production dashboard build.
- 23 automated security tests: outbound target restrictions, unsafe path rejection, forwarding-header stripping, redirect handling, response limits, rate limiting, IP rules, route boundaries and encoded paths, cryptographic JWT checks, actual reverse proxy behavior, request size limits, upstream timeout, and expired configuration fail-closed behavior.
- Live integration checks: token/origin management protections, registration, real proxy forwarding, rate limiting, concurrent repeated-violation incident deduplication, body limits, API-key creation/revocation, valid/invalid JWTs, IP blocking, route authentication, timeout/response bounds, console responses, downtime confirmation, recovery, security events, sanitized history, persistent database data and dashboard analytics.
- Full application restart: an API record, saved request and gateway measurement were created, all four services restarted, and the records successfully read back. The temporary API was then removed.
- Playwright browser workflow in installed Google Chrome: connect, register API, inspect gateway URL, send and inspect a gateway request, edit authentication policy, observe a 401 with diagnostic guidance, delete API, and verify the mobile layout has no horizontal page overflow.
- Desktop dashboard, console and mobile screenshots visually inspected.
- Documented setup command preserves an existing `.env`.

The downloaded Chromium runtime did not launch reliably on this Windows installation. The browser suite passed using `PLAYWRIGHT_CHANNEL=chrome`; this override is documented in the README. Test screenshots are under ignored `test-results/`.

## Boundaries

- No user backend was supplied. Application behavior was verified against the isolated local fixture.
- Backend firewall/network isolation is environment-specific and was not changed or verified. Directly reachable backends can bypass the gateway; see security.md.
- Telemetry uses a bounded, best-effort in-process persistence queue, not a durable audit broker. Rate windows reset at gateway restart.
- Advanced analytics, distributed workers, streaming proxying, remote notifications and automated data retention remain outside the MVP scope.

Temporary API, credential, event, incident and request-history records created by the verification scripts are deleted after successful checks. The PostgreSQL schema and application configuration remain ready for your own APIs.
