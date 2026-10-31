# NAMES column mapping and local completion

The original workbook was inspected read-only. Its SHA-256 is `94f89819611dfde399d288029a988d8cba1c26ed5a1ed2692aef9fb4c666707b`; it contains 1,492 eligible officers, zero held officers, seven parser flags, and no meaningful NAMES columns beyond AL. No actual personnel were imported into a cloud database.

`details[n]` means an ordinary database field in `OfficerPersonnelData.details`, not a runtime read of the workbook or encrypted source staging. Every field is also available in Personnel details subject to its own permission. Domain relationships and histories remain intact.

| Column | Meaning                                     | Database destination                                         | Profile section                                            | Permission family    |
| ------ | ------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- | -------------------- |
| A      | S/NO                                        | Protected ImportRow provenance only                          | Never an officer field                                     | —                    |
| B      | Force number                                | Officer.forceNumber; details[2]                              | Overview / Personnel details                               | officers.view        |
| C      | Payroll number                              | Officer.payrollNumber; details[3]                            | Overview / Personnel details                               | payroll_number       |
| D      | Rank 1                                      | OfficerRankSnapshot.rank1; details[4]                        | Rank history                                               | rank_history         |
| E      | Rank 2                                      | OfficerRankSnapshot.rank2 / rankCode; details[5]             | Rank history; reporting                                    | rank_history         |
| F      | Full names                                  | Officer.fullName; details[6]                                 | Overview / Personnel details                               | officers.view        |
| G      | Tribe / ethnicity                           | Ethnicity relationship; details[7]                           | Overview / Personnel details                               | ethnicity            |
| H      | Full date of birth                          | Officer.dateOfBirth when complete; details[8]                | Overview / Personnel details                               | date_of_birth        |
| I      | Gender                                      | Officer.gender; details[9]                                   | Overview / Personnel details                               | gender               |
| J      | County / district                           | County relationship; details[10]                             | Overview / Personnel details                               | county               |
| K      | Date of enlistment                          | Officer.dateEnlisted when complete; details[11]              | Overview / Service information                             | date_enlisted        |
| L      | Education level                             | Existing OfficerEducation; details[12]                       | Education                                                  | education            |
| M      | Date to unit                                | details[13]; existing OfficerServiceProfile takes precedence | Service information / Assignments                          | service_profile      |
| N      | Date to sub-unit                            | details[14]                                                  | Assignments                                                | assignments          |
| O      | Date of promotion                           | details[15]                                                  | Rank history                                               | rank_history         |
| P      | Duties                                      | Officer.assignedDuties                                       | Overview / Assignments / Personnel details                 | assignments          |
| Q      | Places served                               | details[17]                                                  | Assignments / Personnel movements                          | assignments          |
| R      | Courses attended                            | details[18]                                                  | Courses                                                    | courses              |
| S      | Formation                                   | details[19]                                                  | Assignments / Personnel movements                          | assignments          |
| T      | Disposition / team                          | details[20]; current dated assignment used in reporting      | Assignments / Personnel movements                          | assignments          |
| U      | KCSE grade                                  | Existing OfficerEducation; details[21]                       | Education                                                  | education            |
| V      | Recce membership                            | details[22]                                                  | Service information / Service status                       | service_profile      |
| W      | Remarks                                     | details[23]; existing OfficerServiceProfile takes precedence | Service information / Personnel movements / Service status | service_profile      |
| X      | National ID number                          | Officer.nationalId; details[24]                              | Overview / Personnel details                               | national_id          |
| Y      | Police law examination                      | details[25]                                                  | Examinations                                               | examinations         |
| Z      | Commendations / awards                      | details[26]                                                  | Awards                                                     | awards               |
| AA     | Phone number                                | Officer.phone; details[27]                                   | Overview / Personnel details                               | phone                |
| AB     | Disciplinary convictions and dates          | details[28]                                                  | Disciplinary records                                       | disciplinary_records |
| AC     | Warnings / shortcomings                     | details[29]                                                  | Disciplinary records                                       | disciplinary_records |
| AD     | Recorded rank duration                      | details[30]                                                  | Rank history                                               | rank_history         |
| AE     | Recorded length of service                  | details[31]                                                  | Service information                                        | date_enlisted        |
| AF     | Recorded age                                | details[32]                                                  | Overview / Personnel details                               | date_of_birth        |
| AG     | Recorded retirement date                    | details[33]                                                  | Service information                                        | service_profile      |
| AH     | Recorded remaining time to retirement       | details[34]                                                  | Service information                                        | service_profile      |
| AI     | Recorded sub-unit duration                  | details[35]                                                  | Assignments                                                | assignments          |
| AJ     | Bank account number                         | OfficerPersonnelData.encryptedFinance[36]                    | Financial information                                      | financial_details    |
| AK     | Bank name                                   | OfficerPersonnelData.encryptedFinance[37]                    | Financial information                                      | financial_details    |
| AL     | Recorded retirement warning / cached result | details[38]                                                  | Service information                                        | service_profile      |

## Conversion and access rules

- Every profile read requires officers.view. Permission families above require fields.<family>.view for reading and fields.<family>.write for writes. Existing officer edits additionally require officers.update, CSRF and a matching record version. Existing permissions are never granted automatically. The completion operator needs imports.commit and the relevant individual read/write permissions.
- Identifiers remain strings and explicit zero-padding formats are respected. Assigned duties retains capitalization, punctuation, line breaks and surrounding wording. Rich text is joined as recorded.
- Complete calendar dates are stored/displayed as dates; partial dates and uncertain text remain exactly recorded. Promotion, unit-entry and sub-unit dates are not turned into dated histories automatically. Source durations, ages and retirement notes remain recorded text, not freshly calculated policies.
- Formula results are retained without executing formulas or external references. Missing/error results never become fabricated zeroes. Original formulas and import context remain in protected provenance. Additional meaningful NAMES columns now stop the preview with UNMAPPED_NAMES_COLUMN instead of being silently discarded.
- Rank 1 preserves original specialization; Rank 2 supplies overall grouping. CP and CPL are distinct. Current order is AIG, CP, SSP, SP, ASP, CI, IP, S/SGT, SGT, CPL, PC. Historical S/AIG and RSM remain supported in comparisons.
- Sub-unit terminology is used in the application. MO means Main Office; NA means Not assigned / Not applicable; R means Recce; CRT remains CRT.
- Financial data is AES-256-GCM encrypted using the existing local key with per-officer authenticated context. Normal non-financial reads do not decrypt raw import staging or require the workbook.

## Mapping version 2 and repeat safety

The additive migration adds mappingVersion (existing rows start at version 1). The existing workbook:complete command creates missing personnel records and fills absent JSON keys in existing records. Existing values, including empty strings and nulls, are preserved. Missing financial keys are merged inside the encrypted record. Existing duties, including intentionally cleared duties, are never reseeded for a completed record. Existing snapshots and officer identities are not recreated.

Before writing, the command checks the digest, batch, officer counts, unique links, force-number identity, source-record ownership and encryption key. It locks each officer and retains audited edits to core fields, county/ethnicity and service information. Changes are applied in one transaction; late failures roll back data, version and audit writes. No historical effective dates are invented.

The read-only preview reports officers, added, upgraded, preserved, fieldsAdded, mappingVersion, summaryAdded and changesImported. fieldsAdded counts absent stored keys, including blank cells, without printing values. It does not count newly created officers: this command never creates officers. A version-only upgrade can report upgraded > 0 with fieldsAdded = 0. Repeating a completed version-2 update reports no new fields or upgrades.

Approval remains in the existing protected audit and batch records. The seven original parser flags do not require another field-by-field review. CHANGES is excluded; existing change events and retained source records are untouched. TRIBE and SUB UNIT STRENGTH comparisons keep their existing repeat-safe behavior.

Follow [the Windows update commands](personnel-database-update.md) after installing this code. Keep .env, .local and the original key. Do not reset the database or run local:configure.
