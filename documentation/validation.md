# Validation evidence

Validated in the published environment's subsequent development instance on 29 October 2026. This is current-instance evidence; no new environment publication or production deployment was performed.

- Prisma 6.19 offline WASM/DMMF schema validation passes for all **36 models** and their relationships.
- JavaScript-engine Prisma client generation succeeds without native engine downloads.
- Three committed MySQL migrations apply successfully against isolated MySQL 8.4 databases. Re-running migrations reports them current and preserves checksums.
- Fictional development seeding is repeatable, preserves existing credentials and does not activate personnel policies.
- **24 automated tests pass:** 2 workbook/schema design checks, 5 policy/date/field-permission unit checks, and 17 MySQL/HTTP integration checks. No tests are skipped or disabled.
- Integration checks cover authentication, origin/CSRF rejection, Secure/HTTP-only cookie flags, session hashing/expiry/revocation, password changes, RBAC, field restrictions, redacted audit events, duplicate force numbers, foreign keys, temporal constraints, concurrent overlapping primary assignments, unsafe isolation rejection, import staging, nullable movement references and inactive policies.
- Metadata verification compares every model scalar column/nullability and foreign key with the migrated MySQL schema.
- `npm run typecheck` and `npm run build` pass.
- Built-server HTTP smoke passes: live database health, fictional login, authorized listing and logout.
- The source workbook remains ignored and unchanged. No real officers have been imported; test fixtures are fictional.

Native Prisma engine downloads return HTTP 403 for binaries.prisma.sh under the current network policy. Checksum and TLS verification were never disabled. The tested alternative uses Prisma's pinned WASM validator, JavaScript client engine, MySQL driver adapter and a checksum-aware SQL migration runner with the standard Prisma migration ledger. Native CLI migration deployment has not been validated in this environment.

The React frontend, full officer CRUD/history UI, movement application worker, reports, document uploads and workbook import/export modules are later phases and are not claimed as complete. Sensitive related-data APIs are not exposed by this foundation. Production policy activation, real-data migration, deployment security review and production backup/restore validation remain outstanding.
