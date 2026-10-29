# Database relationships

Updated Phase 2 schema. Every foreign key restricts key updates and deletion. Optional references are marked; unverified dates remain in staging. CHECK constraints and overlap triggers are in migration SQL.

```mermaid
erDiagram
    County o|--o{ Officer : countyId
    Ethnicity o|--o{ Officer : ethnicityId
    Officer ||--o| OfficerServiceProfile : officerId
    Rank ||--o{ RankAlias : rankId
    Officer ||--o{ OfficerRankHistory : officerId
    Rank ||--o{ OfficerRankHistory : rankId
    User ||--o{ OfficerRankHistory : datesVerifiedById
    Officer ||--o| OfficerFinancialDetail : officerId
    Bank o|--o{ OfficerFinancialDetail : bankId
    Unit o|--o{ Unit : parentUnitId
    Unit ||--o{ SubUnit : unitId
    Officer ||--o{ OfficerAssignment : officerId
    Unit ||--o{ OfficerAssignment : unitId
    SubUnit o|--o{ OfficerAssignment : subUnitId
    User ||--o{ OfficerAssignment : datesVerifiedById
    OfficerAssignment ||--o{ DeploymentRecord : assignmentId
    User ||--o{ DeploymentRecord : datesVerifiedById
    Unit ||--o{ RankEstablishment : unitId
    SubUnit o|--o{ RankEstablishment : subUnitId
    Rank ||--o{ RankEstablishment : rankId
    User ||--o{ RankEstablishment : datesVerifiedById
    Officer ||--o{ PersonnelMovement : officerId
    MovementType ||--o{ PersonnelMovement : movementTypeId
    OfficerAssignment o|--o{ PersonnelMovement : fromAssignmentId
    OfficerAssignment o|--o{ PersonnelMovement : toAssignmentId
    Rank o|--o{ PersonnelMovement : fromRankId
    Rank o|--o{ PersonnelMovement : toRankId
    User ||--o{ PersonnelMovement : recordedById
    User o|--o{ PersonnelMovement : approvedById
    User ||--o{ PersonnelMovement : datesVerifiedById
    Officer ||--o{ OfficerStatusHistory : officerId
    PersonnelMovement o|--o{ OfficerStatusHistory : movementId
    User ||--o{ OfficerStatusHistory : datesVerifiedById
    PersonnelMovement ||--o{ MovementDocument : movementId
    User ||--o{ MovementDocument : uploadedById
    Officer ||--o{ OfficerEducation : officerId
    Officer ||--o{ OfficerCourse : officerId
    Course ||--o{ OfficerCourse : courseId
    Officer ||--o{ OfficerAward : officerId
    Officer ||--o{ OfficerDisciplinaryRecord : officerId
    Officer ||--o{ OfficerExamination : officerId
    User ||--o{ UserRole : userId
    Role ||--o{ UserRole : roleId
    Role ||--o{ RolePermission : roleId
    Permission ||--o{ RolePermission : permissionId
    User o|--o{ AuditLog : userId
    Rank o|--o{ RetirementRule : rankId
    User o|--o{ RetirementRule : approvedById
    User ||--o{ ImportBatch : uploadedById
    ImportBatch ||--o{ ImportRow : batchId
    Officer o|--o{ ImportRow : officerId
    User ||--o{ UserSession : userId
    User o|--o{ StrengthInclusionRule : approvedById
```
