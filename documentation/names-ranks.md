# NAMES rank display

**Rank 1** preserves the recorded rank, specification and specialization, such as `Cpl/Drv`, `C.I(W)` or `PC(W)/Sig`. **Rank 2** supplies the overall rank used to group officers. `Cpl/Drv` and `Cpl` both group under `CPL`; `CP` is a distinct rank and is never an alias for `CPL`. Original workbook cells are retained unchanged. Unrecognized or blank Rank 2 values remain unmapped; specialist text is not used to guess a different official rank.

Current displays use **AIG, CP, SSP, SP, ASP, CI, IP, S/SGT, SGT, CPL, PC**, highest first. S/AIG and RSM remain available in historical strength comparison and stored references. This is display ordering, not a database rewrite of rank histories or hierarchy policies.

Officers shows both rank columns. Rank order is the initial order for users with rank access; **Seniority (CO first)** remains available separately. Rank filters group specialists under their overall rank. Filtering and sorting happen before pagination. Unmapped ranks stay after the ordered ranks. Officers with verified effective rank history use that current history; others use their linked NAMES source and are labelled as awaiting verification. Source data never creates a verified promotion or invents a promotion date.

Rank columns require `fields.rank_history.view`. Workbook fallback additionally requires `fields.import_source.view`; source encryption and identity checks remain enforced. Existing source keys, imports and officer records must be preserved.

## Seed structured officer data locally

Core names, identifiers, phone and complete personal dates are already stored in Officer by the importer; other workbook details remain retained in encrypted database source rows. The additive `OfficerRankSnapshot` table now stores Rank 1, original Rank 2 and its overall rank code as structured database fields, linked to the existing officer and source row. This snapshot is a current imported observation: it has an import timestamp, not an invented promotion/effective date. Verified rank histories take precedence.

Stop the application, take a database backup, then run these commands from the project root:

```cmd
git pull --ff-only
npm run local:build
npm run db:migrate
npm run db:seed:officers -- --backup-confirmed
npm run local:start
```

Keep `reference/RECCE DETAILED.xlsx` and `.local/workbook-import.key` in place. For another file or login, append `--file "C:\path\RECCE DETAILED.xlsx" --actor "your-login-email"`. Use `--preview` instead of `--backup-confirmed` for a read-only workbook summary.

The seeder fills missing rank snapshots for an already-imported workbook, without recreating its officers or overwriting existing snapshots, verified histories, edited names, assignments, Changes or source keys. Repeating it is safe. A new import seeds its officers and snapshots in one transaction. Identities that do not match are held; blank or unknown rank codes remain unmapped. All workbook columns remain in the database. No real personnel rows are embedded in GitHub source files.

The list labels snapshots **Imported rank**. This does not claim authoritative historical verification or automatically change personnel service status. Existing batch rollback removes its pristine imported snapshots and officers, preserves encrypted source rows, and refuses records with subsequent edits, review or history.

## Verify dated rank history when authoritative records are available

For an officer who has no rank or movement history, open **Rank history → Verify initial rank**. An authorized reviewer selects the confirmed rank, enters its actual effective date, preserves any spelling/specialist designation, optionally records a document reference and confirms the evidence check. Blank, partial and future dates are rejected. The action records the reviewer and audit metadata; it does not verify other fields or activate a service-status policy. Existing histories cannot be replaced by this action; subsequent rank changes use Changes and independent approval.

## Verify imported officer records in bulk

Record verification is separate from service status and dated history. After the operator accepts an imported dataset, an authorized local administrator can mark its existing officers **VERIFIED**. This writes Officer.verificationStatus, verifiedAt and verifiedById, with per-officer and batch audit entries. It preserves transfers, retirement, suspension, archiving, source-field warnings and all historical dates. No workbook reimport is needed.

Stop the app and update/build/migrate normally, then run:

```cmd
npm run db:verify:officers -- --batch YOUR_IMPORT_BATCH_ID --commit
npm run local:start
```

Omit `--commit` for a read-only preview; use `--actor "your-login-email"` for a different administrator. The command reads the retained database source and matching `.local/workbook-import.key`. It checks operator permissions, source force-number identity and matching seeded rank provenance. Verification is restricted to officers linked to the selected import batch. Missing snapshots or identity conflicts stop the transaction without partial updates. Repeating verification preserves existing verification dates and does not duplicate audit entries.

The list and profile show **Verified**, the rank note becomes **Verified imported rank**, and the Verified filter finds the approved records even if an officer is retired or transferred out. Individual source-field checks and unresolved dates stay separate. Editing an officer's data clears the record-verification stamp and audits that reset, so edited data requires a fresh acceptance. The legacy recordStatus field continues to retain personnel states; verificationStatus is the explicit data-approval field. Successful verification prevents automatic pristine-import rollback from deleting approved records.

Excel S/NO is not an Officer database column. It is removed from personnel details and verification controls; only the original encrypted import copy retains it as part of the archived workbook.
