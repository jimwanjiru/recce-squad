# RECCE Officers Personnel Management System

Phase 3 officer management: a React/TypeScript interface backed by Express, Prisma and MySQL. Register, search, edit, profile, archive and restore officers with server-side sessions, RBAC, sensitive-field permissions and preserved histories. Organizational administration, movements, reports and workbook import/export remain subsequent phases.

- [Updated schema and remaining decisions](documentation/schema-amendments.md)
- [Complete Prisma schema](backend/prisma/schema.prisma)
- [Relationships](documentation/relationships.md)
- [Workbook mapping](documentation/workbook-analysis.md)
- [Officer screens, APIs and startup](documentation/officer-management.md)
- [Backend setup and authentication](documentation/backend-development.md)
- [Validation evidence](documentation/validation.md)

No actual personnel data is committed or imported. Production retirement/strength policies remain inactive. Fictional seed data is explicitly opt-in and rejected in production.

Requires Node.js 24, npm 11, Python 3 and MySQL 8.4 (Docker is supported). Start with `npm ci --ignore-scripts`, `npm run db:generate`, then follow the development guide to configure MySQL, migrate and seed. Run `npm test`, `npm run typecheck`, `npm run typecheck:frontend`, `npm run build`, and, with a dedicated test database configured, `npm run test:integration`.

Native Prisma engine downloads are currently blocked by environment policy. The pinned offline WASM validator, JavaScript-engine client generator and checksum-aware migration runner provide a tested local workflow without disabling artifact or TLS verification. Standard Prisma migration files and migration ledger are retained for deployment environments with native Prisma CLI access.
