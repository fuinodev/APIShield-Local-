# APIShield Local

A local API monitoring and active protection workspace for Windows. Register a backend, route requests through Fastify, configure protection, and investigate actual traffic in a React dashboard. No cloud account, AI, or billing services.

## Windows setup

Prerequisites: Node.js 22.12+ (or Node 24), pnpm, and PostgreSQL 18 running on `127.0.0.1:5432`.

```powershell
pnpm install
pnpm run setup
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Setup creates a dedicated `apishield_local` PostgreSQL role/database and generates a management token in `.env`. It does not modify other databases or change the administrator password. If your administrator requires authentication, set `PGPASSWORD` in your current shell before setup; remove it afterward. For other PostgreSQL versions, set `PSQL_PATH` to your psql executable. If using an existing database, copy `.env.example` to `.env`, set `DATABASE_URL`, and generate a 32-byte random management token yourself. Do not commit `.env`.

Open [the dashboard](http://127.0.0.1:5173) and paste the `MANAGEMENT_TOKEN` value from `.env`. The token is held only in the dashboard's memory and is cleared when you lock or reload the workspace.

- Dashboard: `127.0.0.1:5173`
- NestJS control API: `127.0.0.1:3000`
- Fastify gateway: `127.0.0.1:4000`
- PostgreSQL: `127.0.0.1:5432`

## Use

1. Start your backend on a loopback port listed in `ALLOWED_BACKEND_PORTS` (defaults: 8080, 8081, 8082).
2. Register its name and URL. A unique `/gateway/{slug}` route and a 30-second health monitor are created automatically.
3. Send client requests to the displayed protected gateway URL. Method, query, body, application authorization, and end-to-end headers are forwarded.
4. In API details, configure monitoring and security policies. Defaults allow 120 requests per minute per client, a 1 MiB request body, a 2 MiB response, and a 5-second upstream timeout. Authentication is initially optional.
5. Generate API credentials and set `authMode` to `apiKey`, or configure `jwt` with an RS256 public key, issuer, and audience. JWTs require `exp`, `iat`, and `sub`. Per-path authentication overrides use longest path-prefix matching.
6. Compare direct and protected requests in the testing console. POST/PUT/PATCH/DELETE require a confirmation before sending. Query parameters go in the path; headers and bodies use JSON editors.
7. Review events and incidents. Two consecutive failed checks create a downtime incident; a successful check records recovery. Five matching authentication or rate violations in a minute create a repeated-violation incident.

Gateway changes refresh within two seconds. A cache older than 30 seconds fails closed. Management and dashboard availability are not required to forward traffic while the gateway has a valid configuration cache.

## Verification

```powershell
pnpm build
pnpm test
# With APIShield running (starts and stops its own isolated test backend):
pnpm test:integration
# With APIShield running (browser tests also own their isolated test backend):
pnpm exec playwright install chromium
pnpm test:e2e
```

If the downloaded Chromium runtime does not launch on your Windows installation, use an installed Chrome browser: `$env:PLAYWRIGHT_CHANNEL='chrome'; pnpm test:e2e`.

Tests use only the supplied isolated backend on port 8082 and temporary APIShield records. Do not run the fixture if another application owns that port. No disruptive tests run against registered user backends. Browser tests create and remove their own API record.

## Security and scope

Read [security boundaries](docs/security.md), [architecture](docs/architecture.md), and [API reference](docs/api-reference.md).

APIShield protects only traffic that passes through its gateway. A backend exposed directly on another address remains reachable. Loopback binding alone cannot prevent another process on the same machine from bypassing the gateway. OS-level isolation or firewall rules are needed where bypass prevention is required; APIShield does not silently alter your firewall.

Configuration, measurements, security events, incidents, and sanitized request history persist in PostgreSQL. Saved request history excludes bodies, headers, and query values. Event/history views show recent records while dashboard totals cover the last 24 hours. Data retention is manual in this MVP. Back up the dedicated database using PostgreSQL tools.

## Project layout

`apps/web` React/Vite/Tailwind; `apps/api` NestJS; `apps/gateway` Fastify; `apps/worker` sequential monitoring; `packages/database` Prisma and migrations; `packages/shared` security/networking; `packages/validation` Zod.
