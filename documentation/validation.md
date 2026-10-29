# Validation evidence

Validated in the onboarding instance on 29 October 2026:

- `npm ci --ignore-scripts`: passed; lockfile-based installation, no dependency lifecycle scripts.
- `npm run schema:validate`: passed using Prisma 6.19 WASM DMMF validation, 35 models.
- `npm test`: two fictional-data tests pass: workbook structural counting/privacy and schema key/relation integrity.
- Actual workbook inspected locally with ExcelJS across all four sheets. No records imported.
- `git check-ignore reference/RECCE DETAILED.xlsx`: confirms workbook exclusion.

Native Prisma CLI engine validation could not download its engine checksum because binaries.prisma.sh returned HTTP 403 under the current network policy. Verification was not disabled. The matching offline Prisma WASM validator passed instead. Enable that destination in environment settings before native Prisma migration/client commands are needed.

No application, MySQL integration, migration, authentication, API, browser, report or production-security tests have run: those modules await design approval. The two tests validate the Phase 1 deliverables only. ExcelJS has deprecated transitive dependencies; reassess dependency advisories before implementing production uploads.
