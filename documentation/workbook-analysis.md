# Workbook analysis and mapping

Phase 1 proposal, awaiting database-design approval. The source workbook is retained locally in ignored `reference/RECCE DETAILED.xlsx`; it is not part of this repository. No live records have been imported. The original file is unchanged.

## Inspection results

ExcelJS inspected all four worksheets. Sheet-name matching must trim whitespace: `TRIBE ` has a trailing space. NAMES has 1,493 populated rows including the header, 1,492 name-bearing candidate rows and 38 columns. Its formatted extent reaches row 2,048; formatted rows are not records. No missing or repeated force numbers were detected among candidates; this does not establish that all identifiers or dates are valid.

| Worksheet | Populated rows | Formulas | Cached error cells | Intended use |
| --- | ---: | ---: | ---: | --- |
| NAMES | 1,493 | 7,475 | 7 | Candidate officer data and provenance |
| TRIBE | 70 | 871 | 0 | Ethnicity references and derived rank/ethnicity report |
| CHANGES | 216 | 182 | 0 | Sectioned legacy events and summary reports |
| SUB UNIT STRENGTH | 28 | 277 | 22 | Organization candidates, establishment inputs and derived strength |

Formula results are cached snapshots. ExcelJS does not recalculate them. Do not use cached totals as authoritative current values. The analysis script intentionally emits no officer rows or personal field values.

## NAMES: complete column mapping

| Column | Source header | Destination / treatment |
| --- | --- | --- |
| A | S/NO | ImportRow row provenance; never the officer primary key |
| B | F/NO | Officer.forceNumber, required unique string |
| C | PAYROLL NO | Officer.payrollNumber, string |
| D | RANK | Preserve original in restricted ImportRow; proposed alias lookup into Rank; suffixes may represent specialties |
| E | RANK | Proposed canonical Rank.code / OfficerRankHistory.rankId, subject to approval |
| F | FULL NAMES | Officer.fullName; do not automatically split names or strip honors |
| G | TRIBE | Ethnicity.name / Officer.ethnicityId; restricted demographic access |
| H | FULL DATE OF BIRTH | Officer.dateOfBirth, validated calendar date |
| I | GENDER | Officer.gender; reviewed controlled vocabulary |
| J | COUNTY / DISTRICT | County.name / Officer.countyId; resolve historical district values manually |
| K | DATE OF ENLIST | Officer.dateEnlisted |
| L | EDUCATION LEVEL | OfficerEducation.educationLevel |
| M | DATE TO THE UNIT (COUNTY) | OfficerServiceProfile.dateJoinedUnit; verify unit/county meaning |
| N | DATE TO COMPANY (STATION) | OfficerAssignment.effectiveFrom; verify company/station meaning |
| O | DATE OF PROMOTION | OfficerRankHistory.promotionDate; effectiveFrom only after meaning confirmed |
| P | DUTIES | OfficerAssignment.dutyTitle |
| Q | PLACES SERVED | Restricted ImportRow.rawData pending review; cannot fabricate dated assignment history |
| R | COURSES ATTENDED | Review queue to Course / OfficerCourse; free-text narratives are not reliable structured course/date data |
| S | FORMATION | Restricted source value until hierarchy confirmed; candidate Unit association |
| T | DISPOSITION | OfficerAssignment.disposition; candidate SubUnit code only after classification |
| U | KCSE GRADE | OfficerEducation.kcseGrade |
| V | R | Restricted source value; reporting-membership semantics require confirmation |
| W | REMARKS | OfficerServiceProfile.serviceRemarks; proposed status/deployment classification needs review |
| X | ID. NO | Officer.nationalId, string, restricted access |
| Y | POLICE LAW EXAM (INSP.) | OfficerExamination.score / result after review; not assumed numeric |
| Z | COMMENDATION / AWARDS | OfficerAward after manual parsing; preserve narrative provenance |
| AA | PHONE NO. | Officer.phone, string; retain multiple-number entries pending normalization |
| AB | DISCIPLINARY CONVICTIONS WITH DATES THE LAST ONE WAS COMMITTED | OfficerDisciplinaryRecord, restricted; reviewed extraction only |
| AC | WARNING / SHORTCOMING LETTERS | OfficerDisciplinaryRecord with reviewed recordType; restricted |
| AD | DURATION IN PRESENT RANK | Calculate as of reporting date from effective rank history; not stored as text |
| AE | LENGTH OF SERVICE | Calculate from dateEnlisted; not stored as text |
| AF | AGE | Calculate from dateOfBirth; not stored as text |
| AG | DATE OF RETIREMENT | Calculate using approved RetirementRule; only confirmed exceptions become retirementDateOverride |
| AH | REMAINING TO RETIREMENT | Calculate from projected retirement date and report date |
| AI | DURATION IN PRESENT COMPANY | Calculate from assignment effectiveFrom |
| AJ | BANK ACC.NO | OfficerFinancialDetail.encryptedAccountNumber; authenticated encryption before persistence |
| AK | BANK NAME. | Bank.name / OfficerFinancialDetail.bankId |
| AL | Formula/error header | Derived retirement warning only; never imported as a raw business field |

Dates include Excel dates and potential legacy inconsistencies. Honor the workbook's date system, accept only valid calendar dates, reject impossible birth/enlistment sequences and retain unresolved source cells for review. Identifiers stored numerically in Excel may already have lost leading zeroes: never invent them. Identifier lexical preservation and financial encryption need dedicated import tests in later phases.

## Ranks, structure and formulas

The two rank columns differ on 212 candidate rows. D includes punctuation, gender and specialty suffixes; E is more standardized. Proposed canonical codes: S/AIG, AIG, CP, SSP, SP, ASP, CI, IP, RSM, S/SGT, SGT, CPL and PC. CI aliases include C.I; S/Sgt maps to S/SGT. Alias acceptance is reviewed, not inferred from prefixes. Hierarchy and RSM classification require confirmation before seed data.

Disposition contains MO, HQS, GP1–GP4, RRT, CRT, CTSO, SPEAR and NA. Their appearance as strength-report rows does not prove each is an organizational sub-unit. In particular NA should remain unresolved until its meaning is confirmed. FORMATION is not assumed to equal disposition or duty location. V contains R among candidate records; its operational meaning remains unknown.

NAMES formulas use TODAY, DATEDIF and EDATE for durations, age and retirement warnings. The observed retirement formula does not constitute approved policy. TRIBE uses COUNTIFS on canonical-rank and ethnicity columns and SUM totals; rebuild these from history-aware queries, never duplicate totals in tables.

SUB UNIT STRENGTH contains rank groups with in-camp, detached and total columns, an organizational breakdown, current strength, establishment, total deficit and promotion-deficit sections. Some formulas reference an external workbook and have cached errors. Import only individually reviewed establishment input cells as dated RankEstablishment rows. Derive current strength and deficits from approved policies; do not copy formula totals or promotion-deficit assumptions into the database.

## CHANGES mapping

CHANGES is a sectioned document rather than a rectangular event table. It includes transfers out, death, approved resignation/retirement, struck-off-strength, taken-on-strength, dismissal and suspension sections, plus rank-based summaries for events including reinstatement and reversion. Some detail rows resemble the 38-column nominal roll while other rows use event-specific headers. Never parse the entire sheet with one header or fixed offsets.

| Source element | Proposed destination |
| --- | --- |
| Section label | MovementType.code candidate, reviewed |
| Force number | Officer match; unmatched or ambiguous rows rejected for review |
| Source and normalized rank | RankAlias / fromRankId or toRankId only when direction is established |
| Station / company / destination | Reviewed fromAssignmentId / toAssignmentId; text alone is insufficient |
| GSU and KPS letter or signal references | PersonnelMovement.referenceNumber plus retained source references |
| Adjacent reference dates | Provenance until actual effective date is confirmed |
| Decision / movement event | PersonnelMovement, initially draft; no automatic approval |
| Source row and raw cells | ImportRow, restricted retention and access |
| Summary counts / rank subtotal rows | Recomputed reports, never movements |

Do not equate letter dates with effective dates. Do not create movements from rank totals or unmatched names. A repeated import must not overwrite an officer, reapply a movement or silently merge separate events.
