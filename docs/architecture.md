# Architecture

Four local processes share a PostgreSQL database. The NestJS control service manages APIs, policy configuration, credentials, request testing and dashboard queries. Fastify caches validated configurations and hashed credentials every two seconds. The monitor performs one bounded health check at a time and schedules subsequent checks from completion, avoiding overlap. Vite serves the React/Tailwind dashboard.

Registration creates an API with its unique slug, enabled gateway route, default security policy and monitoring schedule atomically in a single PostgreSQL row. Route, policy, IP rules and monitor configuration are embedded in that row to avoid partially configured APIs. Credentials, measurements, events, incidents and saved requests use separate indexed relational models with cascading deletion. This consolidates the conceptual tables in the brief without dropping their behavior.

The gateway authenticates and rate-limits before reading request bodies. An absolute Fastify limit bounds parser memory; per-API size checks apply both to declared length and actual bytes. Gateway measurements and events enter a bounded asynchronous persistence queue so requests do not require a database query. The queue is best effort: saturation and database errors are reported to the process console without request contents. It is not an audit-grade durable message broker. Gateway configuration expires after 30 seconds without a successful refresh.

The outbound client never follows redirects and bounds request duration and response bytes. Only configured loopback ports are valid backend destinations. Literal loopback resolution removes DNS rebinding risk. Responses are buffered up to the limit; streaming, WebSocket upgrades and SSE are outside this MVP.

Metrics use stored measurements. The dashboard aggregates 24-hour gateway counts and hourly chart buckets in PostgreSQL. Latest health checks supply per-API health. Per-API views return up to 200 measurements and 100 events/incidents. Request history returns the newest 50 records. There is no simulated data.

Use a single monitoring worker and gateway instance. Rate limiting is in-process and resets when the gateway restarts. Multiple gateway processes would require shared rate storage. A future release can add durable telemetry queues, retention jobs and distributed monitoring leases.
