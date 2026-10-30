# Officer CHANGES register

CHANGES is now a dated personnel-event register. Every record has a required foreign key to an existing officer; entering a name or force number alone never creates an officer. Archived officers must be restored before a new event can be recorded/applied. Applied service exits retain the officer and do not archive them automatically.

## Update your local installation

Stop the application and back up the database together with `.env`, `.local` and the original workbook. Then run:

```cmd
git pull --ff-only
npm run local:build
npm run local:start
```

Native startup applies the two additive migrations that create OfficerChange and its approval guard. Existing officers, histories and workbook source rows are not reset. No reimport is needed. The complete Prisma schema now has 37 validated models; the original models/relations remain in place.

## Record and maintain a change

Open **Changes** in the sidebar or **Record change** on an officer profile. Select an existing officer and an event type, then enter the actual effective date. The transfer form and register now use the **13 agreed business columns** listed below. The original 38-position source is retained separately in Workbook source. Labels follow each CHANGES section rather than incorrectly reusing NAMES offsets. **COY is labelled Sub-unit**. Unlabelled physical positions are no longer presented as invented business fields. Legacy values are retained in encrypted storage and the raw source viewer. Letter references and their dates remain separate fields; missing historical references are not invented.

The yearly register defaults to the current Nairobi calendar year. Choose another effective year, event type, approval state or officer search. Different effective years are queried separately and ordered by effective date. An incomplete/unverified event date stays null in the draft layer and appears in **Undated / awaiting date verification**, never under a guessed year. Original source-date strings remain intact in their workbook cells. Rows/page controls limit long tables; horizontal scrolling includes every source column, while View/Edit displays complete cell values.

Draft CRUD is supported: create, read, edit with revision checks and delete. Submission requires a complete valid effective date. Submitted events can be returned to draft for corrections. Applied events cannot be edited or deleted; the database independently prevents either. **Create amendment** links a new corrective event to the original, with its own effective date and independent approval. It does not erase or automatically rewrite past verified timelines.

## Independent approval

Creators/last editors cannot approve their own changes. Administrators can use **Set up approver** to create a separately signed-in Personnel Change Approver account. Enter the real operator's name/email and a private password of at least 14 characters. This role can read the complete source columns and apply personnel events, but receives no user/role administration permission and cannot create/edit drafts. Existing grants on an already-created approver role are preserved rather than silently regranted.

Approval explicitly attests to the effective date and intended officer/action. One READ COMMITTED transaction locks the organization reference scope and the officer, validates the timeline and target references, creates a once-only PersonnelMovement, updates relevant histories and caches, records the approver, and writes a value-free audit entry. A failed approval rolls back all of those effects. Retrying an already-applied approval does not create a second movement.

- Transfer out, death, resignation, retirement, struck-off-strength and dismissal record their respective exit status and close applicable assignments/deployments. They do not delete or archive the officer.
- Suspension records SUSPENDED and retains assignments. It is not an assumed operational-strength exclusion.
- Taken-on-strength and reinstatement record ACTIVE and a verified receiving assignment.
- Sub-unit transfer closes the preceding primary assignment and opens the chosen receiving assignment.
- Reversion closes the preceding rank interval and opens the confirmed target rank.

Receiving units/sub-units and target ranks must exist and be active. **Prepare RECCE references** explicitly creates missing user-confirmed police-rank codes and RECCE sub-unit references; existing names/order/activity/hierarchy are preserved. NA is not created as a sub-unit. For the RECCE formation, choosing Not assigned / Not applicable leaves the sub-unit null and records NA disposition. No personnel, retirement ages or strength-inclusion policies are seeded by this action.

Future events may be drafted/submitted but cannot be applied early; approve them when due. There is no automatic scheduling worker in this release. Events that would splice through a later verified timeline, or create zero-length same-day intervals, remain for deliberate retrospective review. They are not force-applied. Use correctly dated, verified events rather than deleting histories to bypass a conflict. Binary supporting-document upload is not added in this release; worksheet reference/notice/remarks columns are retained.

## Original CHANGES worksheet

**Workbook source** displays all retained source rows/columns, including section headings and rank summaries, from the latest retained import. Source is deliberately separate from the effective-year register because letter dates and summary totals are not verified officer events.

Recognized officer-detail sections offer **Create draft** only when the force number matches a pre-existing, nonarchived officer. The selected force number is checked again on the server. Unmatched officers must be registered first. Source headings and summary rows remain read-only source records and are never turned into fake personnel events. Each source row can link to only one change record. Source-origin drafts can be corrected while the original encrypted ImportRow remains unchanged for provenance.

## Permissions, encryption and live reports

CHANGES sections use different column meanings and contain unrestricted narrative positions. Full-column read requires officers.view and every existing sensitive-field .view grant. Draft writing additionally requires movements.create and the corresponding .write grants. Approval requires movements.approve and movement/assignment/rank/status-history write grants. Sensitive values, reference contents, passwords and source cell data are excluded from audit logs.

Editable fields and retained original cell positions are encrypted with authenticated encryption using the same protected `.local/workbook-import.key` as source staging, bound to the change record ID. Keep this key with protected database backups. If it is missing for an existing installation, restore it; the application does not replace it and silently abandon old ciphertext.

Current dashboard/roster views now prefer verified effective assignments/ranks over source values. Directly registered officers with verified records can participate without an Excel row. Approved exit statuses leave the serving RECCE register and are separately counted as recorded exits; permanent records remain searchable in Officers by record state. NA remains a placement classification, not an inactive service status. Nominal/operational inclusion policies and automatic retirement rules are not inferred from these register effects.

## Validation

MySQL and MariaDB checks cover required officer identity, all 38 columns, source/record encryption, year isolation despite differently dated letters, moving draft years, null-date review, draft editing/deletion, stale revisions, independent approval, immutable applied records, once-only application, reinstatement/rank/status effects, invalid-target rollback, future/backdated refusal and sensitive-column permissions. Chromium tests exercise creation, edit/delete, year selection, approver setup/separate login, application, source-column completeness and mobile overflow. Only fictional test personnel are used in cloud databases.


## Corrected Transfers out layout

The agreed order is S/NO; Force number; Rank 1; Rank 2; Name; Station; Sub-unit; Transferred to; GSU letter/signal reference; GSU reference date; Change type; KPS letter/signal reference; KPS reference date. Rank 1 retains specifications such as C.I(W); Rank 2 is the overall CI rank. Change type is derived from the selected event (Transfer, Death, Retirement, etc.), not a second conflicting manually entered event. Effective date remains a separate system field for year grouping.

The transfer register opens on the Transfer out filter. Original positions N/O supply KPS references/dates; the layout does not relocate or erase their stored values. Draft edits merge supplied fields with existing encrypted values, preserving any legacy source positions not shown in the corrected form. Other event sections show known header fields and will be agreed separately; no generic Additional source value placeholders are generated.

## Disposable fictional examples

Use **Add fictional examples** to create two clearly labelled transfer drafts for two fictional officers with DEMO-CHANGES force numbers, one in the current effective year and one in the previous year. One example uses Rank 1 C.I(W) and Rank 2 CI. No movements, verified assignments, rank histories or service-status transitions are applied. Repeating Add does not duplicate existing samples.

You can edit/delete each draft through normal CRUD. **Remove fictional examples** removes the two sample drafts and their synthetic officers only when no approved/submitted changes, imported rows or other history exists and the synthetic identities are unchanged. It refuses modified/linked records instead of deleting later work. Do not approve these samples if you intend to remove them. The synthetic officers temporarily appear in register totals until removed; no real officer or workbook row is overwritten.
