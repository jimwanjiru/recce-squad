# Phase 4: organizational structure and verified records

The Organization screen manages ranks, rank spellings, units, sub-units, initial assignment baselines, deployment intervals and approved establishment records. All mutations use the existing authenticated session, exact Origin and CSRF checks. No actual workbook values, organizational taxonomy or personnel policies are seeded by this phase.

## Reference administration

- Ranks have an explicitly entered code, name and hierarchy order. Original spellings can be added as aliases; aliases cannot collide with another rank's canonical code or alias. Rank histories retain their own original spellings and specialist designations.
- Units support a parent hierarchy. Serialized changes prevent self-parenting and cycles, including concurrent opposing reparent operations.
- Sub-unit codes are unique within their unit. A sub-unit's parent cannot be reassigned through editing; create a separately reviewed reference instead.
- Administrators can edit names and deactivate/reactivate references. Active child units and sub-units must be deactivated before their parent. Reactivation requires an active parent. Inactive references disappear from new-entry choices while historical associations remain visible.
- Referenced rank codes/order and referenced unit/sub-unit codes cannot be changed. Unit reparenting is blocked once the unit is referenced by assignments, establishments, child units or sub-units. This protects historical interpretation until a separately reviewed dated reorganization design exists. Display-name corrections remain possible.

Reference updates and initial officer registration share an internal database mutex so deactivation cannot race new baseline selections. This is an implementation lock in SystemSetting, not a personnel policy. There are no hard-delete APIs.

## Assignment baselines and deployment history

The assignment module accepts an officer's first verified assignment when the officer has no assignment or movement history. It records dates, verifier, unit/sub-unit, optional duty and remarks. It cannot transfer or reassign an officer, close an assignment, overwrite an assignment, or bypass the later movement approval workflow. Archived officers must be restored before new baseline entries.

Deployment records use a reviewed classification code and optional location label. No meaning or strength inclusion is inferred from that code. Dates must be verified, fit within their assignment and not overlap another deployment on that assignment. An open-ended interval may be closed using a verified end date and the expected verification timestamp. The original start/classification/location cannot be rewritten. A subsequent classification is a new, non-overlapping record.

Database triggers and application transactions enforce interval validity, containment and overlap rejection. A further trigger prevents assignment date updates from stranding existing deployments. History writers must use READ COMMITTED isolation and the officer-row transaction lock. The module does not activate nominal/operational status or calculate strength.

## Approved establishments

Authorized users can record a staffing establishment that has already been approved by the responsible authority. The form requires explicit approval confirmation, verified effective dates, an active unit and rank, optional matching sub-unit and a nonnegative authorized headcount. The authenticated user is recorded as date verifier and the action is audited. This is an attestation of external approval, not an in-app establishment approval workflow or an invented policy.

Overlapping establishments for the same unit/sub-unit/rank are rejected, including concurrent writes. A whole-unit establishment and a sub-unit establishment are distinct scopes; this module does not add them together or assume an aggregation policy. Rank, scope, start date and approved amount are immutable after entry. Open intervals may be closed with a verified end date; subsequent approvals are new dated rows.

Select a reporting date to inspect assignments, deployments and establishments using half-open intervals: `effectiveFrom <= date` and `(effectiveTo IS NULL OR date < effectiveTo)`. Leaving the date blank shows history, not an assumed current total. Deficit, surplus, promotion and strength calculations remain Phase 6 work subject to approved policies.

## Permissions

| Permission | Capability |
| --- | --- |
| organization.view | Reference lists, hierarchy metadata and active reference options |
| ranks.manage | Create/edit/activate ranks and add original spelling aliases |
| units.manage | Create/edit/activate units with hierarchy protections |
| sub_units.manage | Create/edit/activate sub-units |
| assignments.baseline.manage + fields.assignments.write | Record a first verified assignment baseline |
| officers.view + fields.assignments.view | Read assignment history and officer identification |
| officers.view + fields.assignments.view + fields.deployment_records.view | Read deployment history and its assignment context |
| fields.deployment_records.write | Record/close verified deployment intervals |
| establishments.view | Read dated approved establishment records |
| establishments.manage | Record/close externally approved establishments |

The UI additionally requires organization.view for creation forms and the read permissions needed by its pickers. Backend write permissions are checked independently. Reference-only users never receive officer names, locations, financial information, demographics or disciplinary data through reference APIs. Operational role grants and supervisor scopes remain unapproved; the fictional development role alone receives the full catalog when explicitly reseeded outside production.

## API

| Endpoint | Behavior |
| --- | --- |
| GET/POST `/api/ranks`, `/api/units`, `/api/sub-units` | List or create reviewed references |
| PATCH `/api/ranks/:id` | Edit with expectedUpdatedAt; referenced code/order protected |
| POST `/api/ranks/:id/aliases` | Add an explicitly reviewed original spelling |
| PATCH `/api/units/:id` | Edit with expected code/name/active/parent values |
| PATCH `/api/sub-units/:id` | Edit with expected code/name/active values |
| GET `/api/organization/options` | Active reference choices for organization users |
| GET/POST `/api/assignments` | List or record the first verified assignment baseline |
| GET/POST `/api/deployments` | List or record a verified deployment interval |
| GET/POST `/api/establishments` | List or record an externally approved establishment |
| POST `/api/deployments/:id/close` | Close an open interval using effectiveTo, datesVerified and expectedVerifiedAt |
| POST `/api/establishments/:id/close` | Close an open approved interval using the same verification checks |

Lists are paginated (25 by default, maximum 100). Reference lists accept q/active; assignment and deployment lists accept officer-name/force-number q. Dated lists accept asOf and unitId. Responses retain the existing data/meta or error/code format. Write audits store field names, not officer names, locations or sensitive changed values.

## Setup and validation

Use the existing checkout and configuration. Run `npm run db:generate`, `npm run db:migrate`, `npm run db:migrate:test`, then the documented test/build commands. Rerun `npm run db:seed` only with the explicit fictional-development flags to add the new permissions to the fictional role. It does not invent ranks/units or activate personnel policies. Configure production role assignments separately after approval.

New migrations add a temporal establishment index, deployment/establishment guards, explicit ID-variable collations and an assignment/deployment containment guard. Apply migrations before starting the updated server and pause writes during trigger replacement in a deployment maintenance window. Migration checksums remain enforced. The SQL statement helper now handles comments and quoted semicolons correctly and rejects unsupported executable comments.

The local parser failure during development occurred before any schema change. The failed ledger entry was retained and marked rolled back only after verifying the absence of the new lock, index and triggers. Both databases then applied the corrected runner successfully; subsequent runs report migrations current. No databases, user records or published configuration were reset to resolve it.

The test suites use unique fictional fixtures in a dedicated `_test` database. They exercise permissions, canonical/alias collisions, stale writes, hierarchy cycles/concurrency, deactivation, verified baselines, deployment containment/overlap, approved establishment intervals/concurrency, direct-SQL protections and redacted audit logs. Chromium exercises the complete organization UI and historical date selection on desktop/mobile. Officer editing also retains its originally loaded revision and rejects intervening edits instead of adopting a refreshed revision silently.

## Groups and officers

Users with organization.view, officers.view, fields.import_source.view, fields.assignments.view, fields.rank_history.view and fields.service_profile.view now open Organization on **Groups and officers**. Existing rank/unit administration and verified-history forms are unchanged under **Reference and history**. Users without roster permissions retain access to their permitted management modules only.

The group roster provides ALL, RECCE membership, Main Office, HQS, RRT, CRT, GP1–GP4, CTSO, SPEAR, NA, other disposition and blank disposition. Each row links to the officer profile and displays force number, current register name, normalized workbook rank, original rank spelling and workbook placement. Verified current primary assignment/rank values appear separately when available; the view never fabricates an approved assignment from a workbook code. NA means Not assigned / Not applicable.

Search by name/force number, select a group and filter by workbook rank. Source rosters use the same identity-checked workbook placements as the dashboard, exclude archived officers/rolled-back batches and deduplicate officers. RECCE membership overlaps the other group rows. CO-first numeric-force ordering follows the existing private configuration. Officers without linked source data are not silently assigned to a workbook group.

`GET /api/organization/groups` accepts group, rank, q, page and pageSize. Page size is server-bounded at 100; the interface defaults to ten and offers 5/10/25/50. Only the requested page of officer details is returned to the browser, alongside aggregate group counts. A consistent read snapshot keeps each page's count and roster coherent. Source rows are decrypted in bounded batches; bank details, personal contacts, demographics and unrelated source fields are never included in the response. This is an operator roster, not an export endpoint.

MySQL/MariaDB integration checks cover distinct pages, group/rank/RECCE/search filtering, archived records, invalid queries and permission denial. Browser checks cover chart interaction, roster navigation, rank filters and independent dashboard table pagination, alongside existing reference-management flows.
