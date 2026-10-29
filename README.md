# RECCE Officers Personnel Management System

Phase 1: workbook analysis and proposed database architecture for approval. **This repository does not yet contain a running personnel application.** The supplied specification requires approval before migrations, real-data imports or major modules.

- [Workbook analysis and complete source mapping](documentation/workbook-analysis.md)
- [Architecture, security, invariants and approval questions](documentation/architecture.md)
- [Entity relationships](documentation/relationships.md)
- [Complete Prisma schema](backend/prisma/schema.prisma)

## Local design checks

Requires Node.js 24 and npm 11. Run `npm ci`, then `npm test`. Run `npm run schema:validate` for the offline Prisma/WASM structure check. Native Prisma CLI validation additionally needs access to `binaries.prisma.sh`.

Place the source workbook at ignored `reference/RECCE DETAILED.xlsx`, then run `npm run workbook:analyze`. Output contains structural counts and column types only. Never commit the workbook, raw records, credentials or analysis containing personal values. Generated summaries are not proof of valid imported records.

No MySQL database, migrations, administrator account or imports have been created. After design approval, implement the specified backend, React frontend, movement workflow, reports, reviewed import process and security tests in phases. Keep fictional fixtures separate from actual personnel records.
