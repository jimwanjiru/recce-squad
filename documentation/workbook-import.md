# Import the actual workbook on your laptop

This command runs directly with Node.js and your existing local MySQL 8.4 or MariaDB 10.11 database. It uses `.env`, does not require Docker or `local:configure`, and does not upload records to GitHub or a cloud database. Never commit or share the workbook, `.env`, `.local`, database dumps or personnel screenshots.

## What this import does

The supported source is the original 38-column `RECCE DETAILED.xlsx` layout, including the NAMES worksheet. The original preview found **1,492 candidate officers** eligible for core creation, with seven rows carrying field-review warnings. Your preview is authoritative if your file differs.

- Creates new officer names/force numbers, payroll numbers, national IDs, gender, phone, valid complete birth/enlistment dates and education/KCSE values. Numeric identifiers already missing leading zeros cannot be repaired by guessing; explicit zero-padding formats are respected. Original cell values and number formats are retained in encrypted source staging.
- Marks every imported officer **UNVERIFIED**. This does not assert their current service status or strength eligibility.
- Holds partial, ambiguous, invalid or inconsistent dates for review. Creates no rank, assignment, deployment, movement or status-history effective dates. Source promotion dates alone are not verified rank-history start dates.
- Preserves the original rank columns, specialist wording, county/district and ethnicity values, service remarks, courses, exams, awards, discipline, bank values, CHANGES events and other worksheet content in encrypted staging. Those fields are **not yet populated as operational records**, and rank/unit filters remain empty until reviewed mappings and dates are applied. No retirement/strength policies are activated; calculated/formula totals are not treated as personnel records.
- Does not overwrite any officer with an existing force number, including archived officers. Conflicting rows are held, not merged. Duplicate force numbers within the source are all held. A repeated identical file is a no-op, serialized against other imports. A changed file requires a fresh preview hash.

## One-command seeder

After updating the project, run `npm ci --ignore-scripts` and `npm run local:build` if needed. Copy the private workbook to `reference/RECCE DETAILED.xlsx`, stop the app and back up your database. Then run from the main project folder:

```cmd
npm run db:seed:workbook -- --backup-confirmed
```

This calls `tools/seed-workbook.cjs`, computes the file hash automatically, and invokes the same transactional importer described below. It creates all eligible core officer records and encrypted review staging; it does not invent historical dates or approve unresolved policies. Identical workbooks are skipped and existing officers are preserved. No manual hash copying or `local:configure` is needed.

Optional read-only preview:

```cmd
npm run db:seed:workbook -- --preview
```

For another file location append `--file "C:\path\RECCE DETAILED.xlsx"`. For another administrator append `--actor "your-email"`. The named account must have the importer permissions. Keep `.env`, `.local`, the source workbook and generated import encryption key private. This real-workbook seeder is separate from `npm run db:seed`, which remains fictional-development-only.

## 1. Back up and update

Stop the application with Ctrl+C. Use your database client's export/backup function to save **structure and data** for `recce_dev` (or your configured database) to a private backup location. Keep your `.env` and `.local` folder.

Update from GitHub (`git pull` if cloned, or extract the latest ZIP and replace project code while preserving private files). From the main project folder, run:

```cmd
npm ci --ignore-scripts
npm run local:build
```

The database must already have the completed migrations and your application administrator account. If setup is incomplete, follow the native installation guide first. Do not use the fictional `db:seed` command for actual records.

## 2. Place the workbook locally and preview

Create `reference` inside the main project folder and copy your original workbook there, without editing it. The `reference` folder is Git-ignored. In Windows Command Prompt:

```cmd
npm run workbook:import -- --file "reference\RECCE DETAILED.xlsx"
```

Preview reads the file and prints only a SHA-256 hash, sheet names and aggregate counts. It makes **no database changes**. The hash binds the write command to the exact file previewed. Review that the counts match your intended source.

## 3. Commit the import

After making the backup, replace `PASTE_THE_PREVIEW_SHA256` below with the full hash printed by your preview:

```cmd
npm run workbook:import -- --file "reference\RECCE DETAILED.xlsx" --commit --sha256 PASTE_THE_PREVIEW_SHA256 --backup-confirmed
```

By default the audit actor is `admin@recce.local`. If you use another administrator email, append `--actor "your-email"`. That account must be active and have imports.commit, officers.create and the field-write permissions used by this import. The command uses local machine/database access and checks the named actor's grants; it is an operator CLI, not a password-authenticated web endpoint. Run only from your trusted private account on your laptop.

It prints created/held counts and a batch identifier. The operation is one database transaction: officer inserts, staged rows, batch counts and audit metadata commit together. If a database error occurs, that transaction rolls back. It does not reset the database or erase previous batches. A retry of a successful identical import does not insert again.

## 4. Open the register

```cmd
npm run local:start
```

Open **http://localhost:3000**, sign in with your existing account, and open the officer register. Clear rank, unit or status filters if they exclude UNVERIFIED officers. Profile fields still require their normal view permissions.

The import generates `.local/workbook-import.key` for authenticated AES-256-GCM encryption of source rows and unresolved-date payloads. Back up this key privately **after the first import**, together with the database and original workbook. Without it the staged source cannot be decrypted. Do not replace/delete the key or publish it. Windows users should restrict the `.local` folder to their own account; POSIX owner-only modes do not substitute for Windows ACLs. The source-review interface is described below. Historical-record promotion remains a separate verified action; encrypted staging preserves the original values.

If anything fails, share only the error code and aggregate output. Do not paste rows, account numbers, `.env` contents or encryption keys.

## Validation

Fictional tests cover ambiguous dates, conflicting birth/enlistment chronology, source duplicates, encrypted bank/source values, permission denial, transaction rollback after a late failure, repeated-file idempotence, changed-file hashes and preserving existing officers. The actual workbook is used only for an aggregate preview in the cloud workspace; real records are written only when you run the commit command on your laptop.

## Review all original officer fields in the application

After updating/building and starting the app, open an officer profile and select **Workbook details**. It displays all 38 NAMES columns with their original cached cell values, including fields not promoted into operational tables. The record is linked by import provenance and its source force number is checked against the officer on every read/review. A changed name is highlighted for comparison.

Original source values also appear under the relevant profile sections: overview/demographics, service, ranks, assignments, courses, awards, education, examinations, discipline and financial information. These source blocks are labelled pending verification and retain the same backend field permissions. Recorded operational histories stay distinct from workbook narratives. The complete Workbook details tab and other-sheet source viewer remain available.

Each visible field can be marked **checked** or **needs correction** by an authorized reviewer. Reviews retain reviewer ID, timestamp and revision in a separate source-review record. Concurrent/stale reviews receive a conflict rather than overwriting another review. Reviews do not change the original source or activate official rank, movement, assignment, retirement or strength rules. Correcting/promoting those operational records remains a separate verified action.

Source read requires officers.view and fields.import_source.view, plus the individual field view permission. Reviewing additionally requires imports.commit, fields.import_source.write and the individual field's write permission. Bank/disciplinary/demographic values never become visible merely because someone can open a profile. Raw source is decrypted on the server using the private import key and returned only after these checks; audit logs contain column identifiers and review actions, never values.

**Other workbook sheets** provides paginated original CHANGES, TRIBE and SUB UNIT STRENGTH rows, including section headings and source totals. Because column meanings vary between sections, viewing these sheets requires every relevant sensitive read grant. These are source documents for manual comparison; section rows are not automatically asserted to be individual movements or current staffing facts. Per-field checking is available for NAMES officer details; the other sheets are currently a read-only source viewer.

## Seniority ordering and the CO

The default officer-register order is **Seniority (CO first)**. Set the exact CO force number in your private `.env`:

```dotenv
CO_FORCE_NUMBER=YOUR_CO_FORCE_NUMBER
```

Restart the app after changing it. The matching CO appears first. All other numeric force numbers follow in ascending numeric order, retaining full precision and original spellings. Non-numeric identifiers follow numeric identifiers. The setting applies to display ordering only; it never rewrites ranks or creates rank histories. Other order choices remain available in the register. The CO identifier is private configuration, not a committed personnel record.

## Roll back a pristine import

An import failure automatically rolls back the import's database transaction. To reverse a successful batch before anyone edits or reviews its officers, stop the app, back up the database, and use the batch ID printed by the seeder:

```cmd
npm run db:rollback:workbook -- --batch PASTE_BATCH_ID_HERE --backup-confirmed
```

The command checks the local operator's grants and all batch officers first. It refuses reviewed, edited, archived or operationally linked officers rather than deleting later work. For an unchanged batch it removes only officers/initial education created by that batch, detaches source links, retains the encrypted source rows and marks the batch ROLLED_BACK, with an audit entry. Repeating rollback is a no-op. A rolled-back file can subsequently be imported again; if another successful batch for the same file still exists, the normal duplicate-file guard applies. Later manual work requires a reviewed recovery or restoration from your protected backup, not a force-delete switch.
