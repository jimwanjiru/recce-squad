# Approved architecture amendments and remaining policies

The architecture is conditionally approved. These amendments are implemented before Phase 2 migrations. The complete updated schema is [schema.prisma](../backend/prisma/schema.prisma). Existing entities and relationships are retained; 36 models now validate.

| Requirement | Implementation |
| --- | --- |
| General and rank retirement rules | `RetirementRule.rankId` is nullable. Null represents general policy; a single approved rank-specific rule takes precedence over a general rule for the selected date. Missing or overlapping applicable rules produce an explicit error. |
| Missing historical references | `PersonnelMovement.referenceNumber` is nullable. Idempotency uses its own unique key, never a fabricated letter number. |
| Incomplete historical dates | `ImportRow.unresolvedDates` and `verificationStatus` retain unresolved input. Unknown dates never enter dated history or movements. No import pipeline or real-data import has been run. |
| Original rank and specialists | `originalRankSpelling` and `specialistDesignation` on rank history and import staging, with both raw source rank columns retained in restricted `rawData`. RankAlias does not erase original spellings. |
| Two strength measures | `StrengthInclusionRule.includeNominal` and `includeOperational` are independent. They are not inferred from archival status or deployment labels. |
| Configurable inclusion | Strength rules match reviewed status/deployment codes, use effective date intervals and require explicit activation and approval. A reviewed `*` deployment rule may provide a fallback. No inclusion rule is seeded. |
| Sensitive field permissions | Explicit `fields.<field>.view`, `.write`, `.export` permission catalog; scalar officer fields use backend allowlisted selection. Related sensitive records are not exposed by the foundation listing endpoint. |
| Verified reporting dates | Live rank, assignment, deployment, movement, status and establishment records require `datesVerifiedAt` and a verifier FK. Their effective dates must be verified before entry. Policies require approval before activation. |
| Constraints and concurrency | SQL CHECKs validate date intervals and positive/nonnegative policy values. Parent-row locks plus overlap triggers serialize history writes, reject overlapping dates and prevent reassignment of history to another officer. Triggers reject isolation other than READ COMMITTED. Composite temporal indexes support queries. |
| Complete validation | Prisma WASM validates all model relations. MySQL integration tests compare every model scalar column/nullability and foreign key with INFORMATION_SCHEMA. Runtime queries use the generated Prisma JavaScript client and MySQL driver adapter. |

## Verified-history contract

Business dates are calendar dates; API/helper validation rejects partial or rolled-over values. Half-open intervals use `effectiveFrom <= reportDate` and `(effectiveTo IS NULL OR reportDate < effectiveTo)`. Verification stamps attest to the entire interval and its source, including an end date when present. Letter dates must never be substituted for unverified effective dates. Staging is the only destination for unresolved chronology. Unknown policy, missing baseline history or conflicting applicable policy must be reported as unavailable, never represented as zero strength or a guessed retirement date.

Phase 3 permits explicitly verified initial rank/assignment baselines during registration. Phase 4 also supports the first verified assignment baseline, non-overlapping deployment records and externally approved establishment intervals. Approval-based personnel movements and calculated reports remain later phases. Future movement/report modules must use `officerTransaction`, `assertNoOverlap`, verified source dates, approved policy selectors and explicit field permissions. MySQL triggers additionally protect direct database history writes; they require READ COMMITTED isolation. History data cannot be moved between officers. A correction must preserve its provenance and audit metadata.

Database CHECKs and triggers live in migration SQL because Prisma schema syntax cannot express these constraints. Do not use `prisma db push` to replace migrations. Migration checksums reject changed history. Production should use a dedicated migration account with reviewed trigger privileges; the runtime account must not have DDL privileges. Schema reconciliation requires preserving these custom constraints.

## Remaining policy decisions

1. Retirement ages, effective dates, exceptions and the handling of policy changes near a retirement date. No actual retirement age is configured.
2. Unit hierarchy and FORMATION/DISPOSITION relationships; specialist designations and verified operational rank histories. The 13 police-rank reporting codes and order are confirmed in dashboard.md. Code meanings are confirmed: MO = Main Office, NA = Not assigned / Not applicable, R = Recce. These definitions do not determine strength eligibility.
3. Which status/deployment combinations count toward nominal and operational strength, and approved establishment/promotion-deficit calculations.
4. The verified opening baseline date, authority for movement effective dates and resolution of unmatched/ambiguous legacy events.
5. The operational role-to-permission matrix, supervisor scope, retention policy and approved hosting. Only a distinct fictional development role receives permissions in the demo seed.

These decisions do not block Phase 2 authentication or database setup. They do block activation of production personnel rules and real-data import.
