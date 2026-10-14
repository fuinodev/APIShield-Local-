# Control API

Base: `http://127.0.0.1:3000`. Supply `X-APIShield-Token` on every request. JSON body mutations use `Content-Type: application/json`. Browser origins must match the local dashboard. All responses are non-cacheable.

- `GET /apis`: registered API configuration.
- `POST /apis`: `{ "name": "VelisBank", "baseUrl": "http://localhost:8080" }`.
- `GET /apis/:id`: configuration, recent measurements/events/incidents, credential metadata, sanitized request history.
- `PATCH /apis/:id`: partial name, baseUrl, enabled, monitoring, monitorPath, intervalSeconds or full policy.
- `DELETE /apis/:id`: delete API and its dependent history.
- `GET /dashboard`: APIs, latest health, 24-hour gateway aggregates, hourly activity, event categories and recent incidents/events.
- `POST /apis/:id/credentials`: `{ "label": "Development client" }`; returns plaintext key once.
- `DELETE /apis/:id/credentials/:credentialId`: revoke credential.
- `POST /apis/:id/test`: `{ "mode": "gateway", "method": "GET", "path": "/accounts?limit=10", "headers": {}, "name": "Accounts" }`. Optional `body` is a string. Returns statusCode, headers, body and latencyMs.
- `POST /incidents/:id/resolve`: manually acknowledge and resolve a non-downtime incident. Monitoring owns downtime recovery.

Policy fields: rateLimit, windowSeconds, bodyLimit, responseLimit, timeoutMs, authMode (none/apiKey/jwt), issuer, audience, publicKey, ipRules (`cidr`, `action`), routes (`path`, authMode and optional JWT fields). All fields are validated; omitted fields in a policy replacement receive defaults. A replacement is not a merge.

Gateway base: `http://127.0.0.1:4000/gateway/:slug`. The remaining path and query are forwarded. Policy failures return 400, 401, 403, 413 or 429. A stale configuration returns 503. Upstream failures, timeouts and oversized responses return 502. Unknown or disabled routes return 404. Upstream response status codes are preserved.
