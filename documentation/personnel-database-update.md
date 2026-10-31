# Complete an existing local personnel import

This update supports the existing Windows installation with Node.js 24 and MariaDB 10.11.16. It adds database-backed personnel details and editable **Assigned duties** without replacing `.env`, `.local`, credentials, the encryption key, or any existing database contents. Do not run `local:configure` again and do not reset the database.

Stop the running application with Ctrl+C and take a protected MariaDB database backup before migration. Retain `.env`, `.local/workbook-import.key` and your existing `.local` access files with your protected backup. Never add them, the workbook, or database dumps to Git.

From PowerShell in the existing repository directory:

```powershell
git pull --ff-only origin main
npm ci --ignore-scripts
npm run local:build
npm run db:migrate
```

Use the original, unchanged workbook. The following assumes its existing private location is `reference\RECCE DETAILED.xlsx`; change only `--file` if it is elsewhere. `reference` is ignored by Git. The default actor is your existing `admin@recce.local` account. If the import operator uses another email, append `--actor "YOUR_EXISTING_ACCOUNT_EMAIL"` to both commands; do not create a new account or reconfigure the installation.

Preview the remaining work against the existing database (no writes):

```powershell
npm run workbook:complete -- --file "reference\RECCE DETAILED.xlsx" --batch cmvulkd7h0000gg5560gu3sik --sha256 94f89819611dfde399d288029a988d8cba1c26ed5a1ed2692aef9fb4c666707b
```

The preview must report `officers: 1492`. On the first completion it normally reports `added: 1492`; already complete version-2 officers appear under `preserved`. Older records needing missing fields or version metadata appear under `upgraded`; `fieldsAdded` reports the number of absent stored fields to fill. There is no officer-by-officer approval step. The original seven parser flags do not block this approved update, and their recorded values remain available under the ordinary personnel details with the appropriate field permissions.

After making the protected database backup, apply the update using your approval:

```powershell
npm run workbook:complete -- --file "reference\RECCE DETAILED.xlsx" --batch cmvulkd7h0000gg5560gu3sik --sha256 94f89819611dfde399d288029a988d8cba1c26ed5a1ed2692aef9fb4c666707b --commit --approved --backup-confirmed
npm run local:start
```

Each command must succeed before continuing. PowerShell users can check `$LASTEXITCODE` after a command. If Git reports local changes or a non-fast-forward update, preserve those changes and resolve the Git state; do not use a hard reset. If migration fails, inspect the reported migration failure instead of deleting ledger entries. The completion command is one database transaction: a failed update rolls back all of that command's writes. Migrations use the existing checksum-aware migration ledger; MariaDB schema changes themselves are not transactional.

The update checks the exact file digest, batch identity, all officer links and counts, original encryption key, active actor and existing field permissions. It never creates officers, change events, invented dates, assignment histories or personnel policies. It never reads or imports CHANGES into the completion records. Existing Changes events and legacy protected source records are preserved. There is no need to run the earlier officer seeder or verification command again.

Completion creates missing personnel records and upgrades older records field by field. Mapping version 2 fills only absent keys; present values, including blank strings and nulls, are preserved. A version-only upgrade can report no added fields. Existing assigned duties and county/ethnicity relationships are preserved. Subsequent runs retain edited or cleared duties and all existing field values. Existing core identifiers, names, dates, education and all dated histories are not overwritten. Current dated rank/assignment records take precedence in reporting. Approval is retained internally in the audit log and batch metadata, rather than as a badge on each officer.

NAMES column 16 supplies Assigned duties, retaining its wording and line breaks. View it in Overview, Assignments or Personnel details; edit it through **Edit record**. Reading requires `fields.assignments.view`; writing also requires `officers.update` and `fields.assignments.write`, with the existing version check, CSRF and audit protections. Other details retain their respective field-level permissions. Financial account information remains encrypted using the existing key. Source serial is retained only in protected provenance, never as an officer attribute.

TRIBE and SUB UNIT STRENGTH are stored as frozen database comparisons and supporting information under Dashboard → Strength comparison. Current counts are calculated from database personnel records. Missing/error formula results remain unavailable rather than becoming fabricated zeroes. Historical comparisons retain S/AIG and RSM; current grouping uses AIG, CP, SSP, SP, ASP, CI, IP, S/SGT, SGT, CPL, PC. Recorded establishment and retirement values do not activate policies or create dated histories.

The application needs no Excel file after successful completion. Keep a protected archival copy if needed for your records; normal operation reads database records. Keep the encryption key for protected financial information and provenance.

See the [complete NAMES column mapping](names-column-mapping.md) for database destinations, permissions, profile sections and conversion rules.

## Development validation

Use fictional records only in a dedicated database whose name ends in `_test`:

```text
npm run db:migrate:test
npm test
npm run typecheck
npm run typecheck:frontend
npm run typecheck:import
npm run build
npm run test:integration
npm run test:workbook:integration
npm run test:personnel:integration
```

For browser tests, run `npm run test:browser:server` in one terminal and `npm run test:browser` in another (configured Chromium required). The completion suite checks preview, exact hashing, authorization, a late transactional failure, repeat runs, edited/cleared duties, source-file removal, field permissions, stale edits, encrypted finance, approval audit and preservation of CHANGES. No real workbook or personnel records belong in these test databases.
