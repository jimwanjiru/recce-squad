# RECCE Officers Personnel Management System

Run directly on your laptop with **Node.js 24 and MySQL 8.4 (or MariaDB 10.11)**, without Docker:

```bash
git clone https://github.com/jimwanjiru/recce-squad.git
cd recce-squad
npm ci --ignore-scripts
```

Create the MySQL database/account as described in the [no-Docker installation guide](documentation/native-installation.md), then:

```bash
npm run local:configure
npm run local:build
npm run local:start
```

Keep that terminal open. In a second terminal in the same folder, run `npm run local:access` to see your generated login. Open **http://localhost:3000**. Change your password in **Account settings**. Stop with Ctrl+C; restart with `npm run local:start`. MySQL retains your data.

The compiled frontend and backend share one Node.js server. Python, Bash, Docker and a separate frontend development server are not required. The [Docker installation](documentation/local-installation.md) remains optional.


Phase 4 organizational management builds on the React officer interface and secure Express/Prisma/MySQL backend. Manage ranks, rank spellings, unit hierarchies, sub-units, verified assignment baselines, deployments and externally approved staffing establishments. A [local workbook importer](documentation/workbook-import.md) now creates core officer records with encrypted source staging. The CHANGES register now supports dated, independently approved personnel events. Automatic scheduling, retrospective timeline reconciliation, supporting-document uploads and workbook export remain pending. Officer profiles include permission-filtered workbook details and a source-review checklist; the local importer also provides a guarded rollback command. The dashboard has interactive analytics, and Organization includes paginated group rosters with officer ranks.

- [CHANGES register, yearly CRUD and independent approval](documentation/changes.md)
- [Officer dashboard and workbook count definitions](documentation/dashboard.md)
- [Updated schema and remaining decisions](documentation/schema-amendments.md)
- [Complete Prisma schema](backend/prisma/schema.prisma)
- [Relationships](documentation/relationships.md)
- [Workbook mapping](documentation/workbook-analysis.md)
- [Organization management and permissions](documentation/organization-management.md)
- [Officer screens, APIs and startup](documentation/officer-management.md)
- [Backend setup and authentication](documentation/backend-development.md)
- [Validation evidence](documentation/validation.md)

No actual personnel data is committed or imported. Production retirement/strength policies remain inactive. Fictional seed data is explicitly opt-in and rejected in production.

For native development only: Node.js 24, npm 11 and MySQL 8.4 are required. Start with `npm ci --ignore-scripts`, `npm run db:generate`, then follow the development guide to configure MySQL, migrate and seed. Run `npm test`, `npm run typecheck`, `npm run typecheck:frontend`, `npm run build`, and, with a dedicated test database configured, `npm run test:integration`.

Native Prisma engine downloads are currently blocked by environment policy. The pinned offline WASM validator, JavaScript-engine client generator and checksum-aware migration runner provide a tested local workflow without disabling artifact or TLS verification. Standard Prisma migration files and migration ledger are retained for deployment environments with native Prisma CLI access.
