# RECCE Officers Personnel Management System

Run the local application with Docker Desktop / Docker Compose:

```bash
git clone https://github.com/jimwanjiru/recce-squad.git
cd recce-squad
docker compose up --build -d --wait
docker compose exec app node tools/local-access.cjs
```

Open **http://localhost:3000** and use the generated administrator login. Change your password in **Account settings**. Stop with `docker compose stop`; your database and credentials persist. No host Node.js, Python or MySQL installation is required.

See the [local installation guide](documentation/local-installation.md) for prerequisites, alternate ports, updates and troubleshooting.


Phase 4 organizational management builds on the React officer interface and secure Express/Prisma/MySQL backend. Manage ranks, rank spellings, unit hierarchies, sub-units, verified assignment baselines, deployments and externally approved staffing establishments. Approval-based personnel movements, calculated reports and workbook import/export remain subsequent phases.

- [Updated schema and remaining decisions](documentation/schema-amendments.md)
- [Complete Prisma schema](backend/prisma/schema.prisma)
- [Relationships](documentation/relationships.md)
- [Workbook mapping](documentation/workbook-analysis.md)
- [Organization management and permissions](documentation/organization-management.md)
- [Officer screens, APIs and startup](documentation/officer-management.md)
- [Backend setup and authentication](documentation/backend-development.md)
- [Validation evidence](documentation/validation.md)

No actual personnel data is committed or imported. Production retirement/strength policies remain inactive. Fictional seed data is explicitly opt-in and rejected in production.

For native development only: Node.js 24, npm 11, Python 3 and MySQL 8.4 are required. Start with `npm ci --ignore-scripts`, `npm run db:generate`, then follow the development guide to configure MySQL, migrate and seed. Run `npm test`, `npm run typecheck`, `npm run typecheck:frontend`, `npm run build`, and, with a dedicated test database configured, `npm run test:integration`.

Native Prisma engine downloads are currently blocked by environment policy. The pinned offline WASM validator, JavaScript-engine client generator and checksum-aware migration runner provide a tested local workflow without disabling artifact or TLS verification. Standard Prisma migration files and migration ledger are retained for deployment environments with native Prisma CLI access.
