# Backend development and API

## Local development

Use the existing checkout; cloud tasks are isolated, so create no Git worktree unless explicitly requested. Never copy real workbook rows into test fixtures, logs or seed files. `reference/`, `.env`, `.local/`, generated Prisma clients and build outputs are ignored.

Run from the repository root:

```bash
npm ci --ignore-scripts
npm run db:generate
node tools/init-development.cjs
```

The initialization helper generates random local database/demo credentials in ignored, owner-only files. It preserves existing configuration. If an existing `.env` is supplied, configure the database consistently with it; do not overwrite it. `.env.example` documents variables. No hardcoded seed password is shipped.

Start MySQL for local development only:

```bash
docker run -d --name recce-mysql \
  -p 127.0.0.1:3307:3306 \
  --env-file .local/mysql.env \
  --mount type=volume,source=recce-mysql-data,target=/var/lib/mysql \
  mysql:8.4 --skip-log-bin
```

Wait for MySQL startup; this internal readiness request performs a database operation without printing credentials:

```bash
docker exec recce-mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" mysql -urecce_dev -D recce_dev -e "SELECT 1"'
npm run db:migrate
npm run db:seed
npm run dev
```

`--skip-log-bin` is for this isolated development database so a schema-scoped account can create triggers. Production replication/binlog/backup policy must be configured by its DBA; do not copy this choice into production. With binary logging enabled, the migration account needs reviewed trigger-creation privileges. Use a separate least-privilege runtime account in production.

The server binds loopback port 3000 by default. Its health endpoint checks MySQL, not just the HTTP process. Live processes do not survive environment restoration; restart with `docker start recce-mysql` and `npm run dev`. Retain the named volume and ignored configuration files. Do not remove a database or volume containing user work.

The fictional login is `developer@example.invalid`, using the password generated locally in `.env` under `DEMO_ADMIN_PASSWORD`. Read that local file securely when signing in; do not paste credentials into chat or Git. Re-running the seed preserves existing passwords and fictional records. It creates six named operational roles without presumed grants, plus a distinct fictional development role with the permission catalog. No retirement, strength, establishment or actual workbook rows are seeded.

See [Phase 3 officer management](officer-management.md) for the React application, officer mutation/profile APIs, frontend development and browser tests.

## Authentication and authorization API

All responses use `{ data }` or `{ error: { code } }`. Validation errors include safe field paths. Cookies are HTTP-only and SameSite Strict; production uses a Secure `__Host-` cookie and requires an HTTPS `APP_ORIGIN`. Tokens are random and only their SHA-256 hashes are stored. Passwords use Argon2id. Sessions expire after eight hours; password changes revoke all sessions. Account deactivation and user-role changes revoke sessions; permissions are reloaded on every request.

| Method and endpoint | Purpose / permission |
| --- | --- |
| GET `/api/health` | Live database readiness, anonymous |
| POST `/api/auth/login` | Email/password; exact Origin required; IP rate limit |
| GET `/api/auth/me` | Current identity and effective permission codes |
| GET `/api/auth/csrf` | Refresh CSRF token after reload; rejects cross-site requests |
| POST `/api/auth/logout` | Revoke current session |
| POST `/api/auth/password` | Current password + new password of at least 14 characters; rate limited |
| GET `/api/officers` | `officers.view`; paginated/searchable register (see Phase 3 officer API documentation) |
| GET/POST `/api/users` | `users.manage`; bounded list or create user without roles |
| PATCH `/api/users/:id` | `users.manage`; toggle active flag; self-deactivation rejected |
| PUT `/api/users/:id/roles` | `roles.manage`; replace explicit role IDs, revoke sessions; self-change rejected |
| GET `/api/roles`, `/api/permissions` | `roles.manage` |
| PUT `/api/roles/:id/permissions` | `roles.manage`; replace explicit permission IDs; own-role mutation rejected |
| GET `/api/audit-logs` | `audit_logs.view`; paginated redacted audit metadata |

After login, send the returned cookie plus `X-CSRF-Token` and exact `Origin` on every mutation. Login also checks Origin to prevent login CSRF. The CSRF refresh endpoint is an authenticated read protected by cookie policy, same-origin browser controls and request-origin checks. No cross-origin API access is enabled.

Sensitive permissions are cataloged in `backend/src/config/permissions.ts`. General officer lists never expose financial, disciplinary, location, raw import or other related records. National ID/contact/demographic scalar fields require individual `.view` permissions; exports additionally require their `.export` permissions. Sensitive writes must use individual `.write` checks in later modules. A permission catalog is not an approved operational role matrix.

Audit events store changed field names, never passwords, tokens or sensitive changed values. Error logs include event/type only. Database credentials are never logged. General APIs never return password/session hashes. Production needs HTTPS reverse proxy configuration, reviewed distributed rate limiting for multiple replicas, backup/restore testing, key management, least-privilege database access and an approved operational permission matrix. This foundation has not been production deployed or penetration tested.

## Migrations and tests

`npm run db:migrate` applies the checked-in Prisma migration SQL, validates checksums, uses a named advisory lock and writes the standard `_prisma_migrations` ledger. It never resets a database. MySQL DDL is not transactional: a failed migration is retained and blocks automatic retries. Inspect/recover the actual partial schema and ledger deliberately; do not simply delete failed entries. The files and ledger follow Prisma conventions; native `prisma migrate deploy` compatibility has not been exercised because engine downloads are blocked. Validate that deployment path in the target environment before production use. The current helper is pinned to Prisma 6.19 and must be reviewed on upgrade.

The offline client generator calls Prisma's pinned generator RPC with the validated DMMF and JavaScript-engine configuration; Python manages the subprocess handshake. npm integrity checks remain enabled. Native engine binaries are neither downloaded nor spoofed.

Create a separate test schema and grant the local development user access, using only this task's database container:

```bash
docker exec recce-mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "CREATE DATABASE IF NOT EXISTS recce_test; GRANT ALL ON recce_test.* TO recce_dev;"'
npm run db:migrate:test
npm test
npm run typecheck
npm run build
npm run test:integration
```

`TEST_DATABASE_URL` must be explicit and end in `_test`; the integration runner refuses production. Tests use per-run fictional fixtures and remove only those fixtures. They do not truncate tables or import the workbook. History writes use READ COMMITTED connections, parent locks and database overlap checks. Other isolation levels are rejected by triggers. Unverified dates remain in ImportRow staging, never live effective-date history.
