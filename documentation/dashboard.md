# Officer dashboard

Open **Dashboard** in the sidebar, or `http://localhost:3000/dashboard`.

The dashboard reads the workbook rows already stored by the real-workbook seeder. No reimport or schema migration is required for an existing complete import. Update the project while preserving `.env`, `.local` and `reference`, then run `npm run local:build` and restart with `npm run local:start`. The private `.local/workbook-import.key` must match the imported source rows.

## Counts and group definitions

- Total officers: current register records excluding archived records; no service-status eligibility is inferred. The page separately identifies unverified and archived records.
- RECCE: linked officer source rows with R in the membership column, independently of disposition. It overlaps team membership and must not be added to the group totals.
- Group breakdown: MO (Main Office), HQS, RRT, CRT, GP1–GP4, CTSO, SPEAR and NA. CRT is the confirmed workbook code; SRT in the original request was a typing error. NA means Not assigned / Not applicable. Other and blank dispositions remain visible for reconciliation.

Categories and source comparison come from the imported **SUB UNIT STRENGTH** worksheet. The register breakdown is recomputed from each linked NAMES row's disposition, with the source force number validated against its officer. Each officer is counted once. Archived officers and rolled-back batches are excluded. Officers without usable source rows remain in the register total and are explicitly counted as missing source coverage, not assigned to an invented group.

Source data remains unverified until reviewed. These are register/source counts, not an approved operational strength calculation. They do not apply assumed retirement, absence, deployment or status-inclusion policies. They do not assert that a workbook placement is a verified current assignment.

## Workbook comparison

The comparison uses the latest retained import's SUB UNIT STRENGTH source rows. Column AK (37) supplies cached totals for each recognized group, the R row and the overall TOTAL row. Cached formula errors and absent values display **Unavailable**, never zero. Genuine zero is preserved. Workbook totals can differ because of cached values, erroneous/external formulas, source revisions, archive changes or missing coverage; differences are displayed for review, not silently corrected.

The endpoint returns counts only, not names, identifiers, locations, bank details or decrypted rows. It requires `reports.view`, `officers.view`, `fields.import_source.view`, `fields.assignments.view` `fields.service_profile.view` and `fields.rank_history.view`. Existing local administrators already have these catalog grants. The dashboard does not assign permissions automatically.

One read-only repeatable-read transaction keeps each report's register totals and source counts consistent. Source rows are processed in bounded pages to limit memory on local computers. Refresh recalculates counts; no stale aggregate table or workbook formula engine is used. Source dates are import provenance, not claimed historical effective dates.

## Validation

Fictional tests verify count reconciliation, overlapping RECCE membership, archive exclusion, source mismatches, missing/error/zero cached totals and report-permission denial. MySQL and MariaDB integration tests cover the consistent-snapshot endpoint. Chromium tests verify the dashboard values and mobile layout without exposing source personal values. The original workbook was inspected offline for aggregate reconciliation; real officer records were not imported into cloud test databases.


## Police-rank strength and establishment comparison

The rank order is user-confirmed: **S/AIG, AIG, CP, SSP, SP, ASP, CI, IP, RSM, S/SGT, SGT, CPL, PC**. The dashboard now includes:

- A sub-unit-by-rank matrix, following the worksheet's rank-column layout. All requested ranks appear even when their register count is zero. RECCE is a separate membership summary; the group rows and the workbook-linked total reconcile independently.
- A rank comparison table with register count, RECCE count, workbook current strength, source establishment and the arithmetic gap to source establishment. Positive means fewer register officers than the source input; negative means more. The source establishment is an unverified workbook input, not a newly activated dated RankEstablishment rule.

Counts use the standardized rank column E in NAMES. C.I/C.I. are displayed under CI; source casing such as S/Sgt, Sgt and Cpl is grouped under S/SGT, SGT and CPL. All original spellings and specialist designations remain unchanged in source staging. Unrecognized or blank standardized ranks appear in an additional unmapped column/row so they cannot disappear from totals. Force numbers and the CO display-order exception never determine these rank counts.

Workbook current-strength and establishment inputs use the worksheet's total columns: B, E, H, K, N, Q, T, W, X, AA, AD, AG and AJ. The rows labelled Current Strength and Establishment are read from the latest retained source import. Errors/missing values remain unavailable, while literal zero remains zero. A total establishment/gap is shown only when all 13 source establishment inputs are available. In-camp/detached classifications and promotion-deficit formulas are not invented from these inputs.

Rank counts require the existing fields.rank_history.view permission in addition to the dashboard's other grants. Unit and integration tests cover all 13 columns, CI spelling equivalence, unmapped ranks, zero/error source values, positive/negative gaps and rank-permission denial. Chromium checks cover the matrix and comparison headings; source spellings are not rewritten.
