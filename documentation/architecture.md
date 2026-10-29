# Proposed database architecture

This is a design proposal, not a running application. All 34 requested entities are represented in `backend/prisma/schema.prisma`, plus RankAlias. Prisma names use singular PascalCase and fields camelCase; table/field naming is an implementation convention rather than a change in meaning. The schema is the complete field/type/key reference. `relationships.md` renders every foreign-key relationship.

## Design changes proposed for approval

- Add RankAlias for explicit reviewed legacy spellings; preserve source values separately.
- Add PersonnelMovement.appliedAt and unique idempotencyKey to support transactional, once-only processing independently of approval.
- Add Officer.version for optimistic concurrency; use a row lock as well for temporal updates.
- Replace public document file paths with private storage keys, hashes, sizes, content types and quarantine status. Downloads require authorization and malware clearance.
- Store only hashed session tokens and CSRF tokens; add session creation time. Never store bearer tokens as the session primary key.
- Add ImportBatch.fileSha256 and ImportRow.officerId for source reconciliation. Do not make filename or hash sufficient authority to overwrite records.
- Add financial keyVersion and ciphertext bytes. Use AES-256-GCM with per-record nonce and authentication tag in a versioned envelope and an external managed key; never save keys with the database.
- Use nullable legacy dates and references rather than inventing missing information. Missing dates cannot participate in historical reports until reviewed. New officer registration can require more fields than legacy staging.
- Store national IDs and phone numbers as strings with field-level access. Encrypt national IDs at application level or migrate to a dedicated encrypted field before production if required by approved policy. General APIs must use explicit field projections.
- Preserve free-form education, training, award and disciplinary narratives in restricted import staging until dates/entities can be reviewed. Raw staging is sensitive and subject to retention policy, backups and encryption.

## Entity groups and keys

Every entity has a generated internal string primary key except UserRole and RolePermission, whose composite primary keys prevent duplicate membership. Officer.forceNumber is unique; email, rank code, permission code, unit code, setting key, session token hash and document storage key are also unique. SubUnit code is unique within its unit. ImportRow is unique per batch/sheet/row. Nullable unique course codes allow courses without known codes.

| Group | Entities | Cardinality and purpose |
| --- | --- | --- |
| Identity | Officer, County, Ethnicity | County/ethnicity each have many officers; optional for incomplete legacy data |
| Service | OfficerServiceProfile, Rank, RankAlias, OfficerRankHistory | One profile per officer; many dated rank records; aliases belong to one rank |
| Finance | Bank, OfficerFinancialDetail | At most one finance record per officer; many accounts can reference a bank |
| Organization | Unit, SubUnit, OfficerAssignment, DeploymentRecord, RankEstablishment | Units form a tree; units have sub-units; officers have many dated assignments; assignments have dated deployments |
| Movements | MovementType, PersonnelMovement, OfficerStatusHistory, MovementDocument | Movements reference officers, optional old/new rank and assignment, recorder and approver; statuses and documents refer back to movements |
| Administration | OfficerEducation, Course, OfficerCourse, OfficerAward, OfficerDisciplinaryRecord, OfficerExamination | Independent officer histories; Course is a reusable reference |
| Access | User, Role, Permission, UserRole, RolePermission, UserSession | Many-to-many role/permission membership and revocable expiring sessions |
| Governance | AuditLog, RetirementRule, ImportBatch, ImportRow, SystemSetting | Actor-attributed events, dated policy, restricted import provenance and versioned settings |

All foreign keys have explicit inverse relations and restrictive deletion. Do not hard-delete referenced personnel or history. Archive and restore change recordStatus/deletedAt and write audit metadata; archive alone does not imply retirement or removal from historical strength.

## Invariants requiring implementation beyond Prisma

Prisma validates structure, not business correctness. Before migrations, add reviewed MySQL CHECK constraints for valid intervals, nonnegative establishments and valid retirement ages. MySQL has no exclusion constraint for overlapping date intervals: serialize writes by locking the officer row inside a transaction, validate overlaps for rank/status/primary assignments, then close/open intervals. Lock the relevant unit/rank policy scope for establishment/rule edits. Reject unit hierarchy cycles, self-approval and assignments whose sub-unit belongs to another unit. These rules are not enforced by the proposed schema alone.

Use half-open intervals `[effectiveFrom, effectiveTo)` and calendar dates in Africa/Nairobi for business dates; store audit/session instants in UTC. Historical reports join only records effective on the selected reporting date. Require a deliberate baseline date for initial records; the workbook cannot reconstruct unknown past histories. Corrections retain original provenance and audit events. Future-dated approvals are applied by a restart-safe worker when due, under the same transaction/row locks as interactive changes. Backdated changes must validate the entire affected timeline.

A movement transaction checks permission, approval, due date, previous history and idempotency; creates/closes history; writes appliedAt and a redacted audit entry atomically. Reports count officers once using the approved nominal/operational inclusion policy. Proposed deficit = authorized minus included strength, with negative values shown as surplus. Promotion deficits require separate confirmed rules. Retirement remains unavailable when no applicable approved rule/override exists.

## Security and application plan after approval

React/TypeScript/Vite/Tailwind/shadcn UI, Router, Query, Hook Form, Zod, Lucide and Recharts frontend; Express/TypeScript/Zod backend; Prisma/MySQL persistence. Use ExcelJS for spreadsheets and a maintained PDF library after dependency review. Package installation alone is not a production security review.

Use Argon2id passwords, opaque secure HTTP-only SameSite session cookies, CSRF tokens on mutations, login throttling, HTTPS, bounded uploads, parameterized Prisma queries and safe centralized errors. Every endpoint checks backend permissions; supervisors need explicit assignment scope. Define separate permissions for demographic, national ID/contact, financial and disciplinary reads and writes. Existing example permissions are insufficient for these fields. Exports require both report/export and underlying sensitive-field permissions; protect against spreadsheet formula injection. Audit reads and exports without copying sensitive values into audit logs. Store changed field names and redacted metadata only. Production needs reviewed backup encryption, restoration drills, retention and deployment access controls.

Roles proposed: System Administrator, Personnel Administrator, Records Officer, Sub-Unit Supervisor, Reporting Officer, Read-Only User. Approve an explicit permission matrix before seeding. No default passwords, real data fixtures or automatic production admin account.

## Decisions needed before Phase 2

1. Approve or amend this schema and proposed changes. Confirm E is canonical rank, how specialties should be retained, rank hierarchy and RSM meaning.
2. Identify real sub-units versus reporting categories, especially MO/NA; explain FORMATION, DISPOSITION and R, and confirm the unit hierarchy.
3. Approve status/deployment categories and which count toward nominal and operational strength (including suspension, attachment, training and awaiting returns).
4. Provide authorized retirement rules, effective dates, exceptions, and establishment/promotion-deficit policy. Workbook formulas alone cannot authorize these.
5. Confirm the baseline reporting date, event effective-date source when letter dates differ, and how to resolve unmatched historical events.
6. Approve the role/sensitive-field permission matrix and organization-approved deployment/data-retention requirements before real-data import.

Until these are resolved, later code can only treat affected rules as unconfigured; no production rule should be guessed.
