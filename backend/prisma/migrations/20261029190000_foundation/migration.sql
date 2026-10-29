-- Initial MySQL 8.4 migration authored from the validated Prisma datamodel.

CREATE TABLE `Officer` (
  `id` VARCHAR(191) NOT NULL,
  `forceNumber` VARCHAR(64) NOT NULL,
  UNIQUE INDEX `Officer_forceNumber_key` (`forceNumber`),
  `payrollNumber` VARCHAR(64) NULL,
  `fullName` VARCHAR(255) NOT NULL,
  `nationalId` VARCHAR(64) NULL,
  `dateOfBirth` DATE NULL,
  `gender` VARCHAR(32) NULL,
  `countyId` VARCHAR(191) NULL,
  `ethnicityId` VARCHAR(191) NULL,
  `dateEnlisted` DATE NULL,
  `phone` VARCHAR(255) NULL,
  `recordStatus` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  `version` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerServiceProfile` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `OfficerServiceProfile_officerId_key` (`officerId`),
  `dateJoinedUnit` DATE NULL,
  `retirementDateOverride` DATE NULL,
  `serviceRemarks` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Rank` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `Rank_code_key` (`code`),
  `name` VARCHAR(191) NOT NULL,
  `hierarchyLevel` INTEGER NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RankAlias` (
  `id` VARCHAR(191) NOT NULL,
  `alias` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `RankAlias_alias_key` (`alias`),
  `rankId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerRankHistory` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `rankId` VARCHAR(191) NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `promotionDate` DATE NULL,
  `referenceNumber` VARCHAR(191) NULL,
  `originalRankSpelling` VARCHAR(191) NULL,
  `specialistDesignation` VARCHAR(191) NULL,
  `remarks` TEXT NULL,
  `datesVerifiedAt` DATETIME(3) NOT NULL,
  `datesVerifiedById` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `OfficerRankHistory_officerId_effectiveFrom_effectiveTo_idx` (`officerId`, `effectiveFrom`, `effectiveTo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `County` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `County_name_key` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Ethnicity` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `Ethnicity_name_key` (`name`),
  `isActive` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Bank` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `Bank_name_key` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerFinancialDetail` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `OfficerFinancialDetail_officerId_key` (`officerId`),
  `bankId` VARCHAR(191) NULL,
  `encryptedAccountNumber` BLOB NOT NULL,
  `keyVersion` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Unit` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `Unit_code_key` (`code`),
  `parentUnitId` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SubUnit` (
  `id` VARCHAR(191) NOT NULL,
  `unitId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SubUnit_unitId_code_key` (`unitId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `unitId` VARCHAR(191) NOT NULL,
  `subUnitId` VARCHAR(191) NULL,
  `dutyTitle` VARCHAR(191) NULL,
  `disposition` VARCHAR(191) NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT 1,
  `remarks` TEXT NULL,
  `datesVerifiedAt` DATETIME(3) NOT NULL,
  `datesVerifiedById` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `OfficerAssignment_officerId_effectiveFrom_effectiveTo_idx` (`officerId`, `effectiveFrom`, `effectiveTo`),
  INDEX `OfficerAssignment_unitId_subUnitId_effectiveFrom_effectiveTo_idx` (`unitId`, `subUnitId`, `effectiveFrom`, `effectiveTo`),
  INDEX `OfficerAssignment_officerId_isPrimary_effectiveFrom_effectiveTo_` (`officerId`, `isPrimary`, `effectiveFrom`, `effectiveTo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DeploymentRecord` (
  `id` VARCHAR(191) NOT NULL,
  `assignmentId` VARCHAR(191) NOT NULL,
  `deploymentStatus` VARCHAR(191) NOT NULL,
  `locationLabel` VARCHAR(191) NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `remarks` TEXT NULL,
  `datesVerifiedAt` DATETIME(3) NOT NULL,
  `datesVerifiedById` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `DeploymentRecord_assignmentId_effectiveFrom_effectiveTo_idx` (`assignmentId`, `effectiveFrom`, `effectiveTo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RankEstablishment` (
  `id` VARCHAR(191) NOT NULL,
  `unitId` VARCHAR(191) NOT NULL,
  `subUnitId` VARCHAR(191) NULL,
  `rankId` VARCHAR(191) NOT NULL,
  `authorizedStrength` INTEGER NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  PRIMARY KEY (`id`),
  INDEX `RankEstablishment_unitId_rankId_effectiveFrom_idx` (`unitId`, `rankId`, `effectiveFrom`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MovementType` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `MovementType_code_key` (`code`),
  `name` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PersonnelMovement` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `movementTypeId` VARCHAR(191) NOT NULL,
  `effectiveDate` DATE NOT NULL,
  `fromAssignmentId` VARCHAR(191) NULL,
  `toAssignmentId` VARCHAR(191) NULL,
  `fromRankId` VARCHAR(191) NULL,
  `toRankId` VARCHAR(191) NULL,
  `referenceNumber` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `remarks` TEXT NULL,
  `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
  `recordedById` VARCHAR(191) NOT NULL,
  `approvedById` VARCHAR(191) NULL,
  `approvedAt` DATETIME(3) NULL,
  `appliedAt` DATETIME(3) NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `PersonnelMovement_idempotencyKey_key` (`idempotencyKey`),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `datesVerifiedAt` DATETIME(3) NOT NULL,
  `datesVerifiedById` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `PersonnelMovement_approvalStatus_effectiveDate_appliedAt_idx` (`approvalStatus`, `effectiveDate`, `appliedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerStatusHistory` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `movementId` VARCHAR(191) NULL,
  `datesVerifiedAt` DATETIME(3) NOT NULL,
  `datesVerifiedById` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `OfficerStatusHistory_officerId_effectiveFrom_effectiveTo_idx` (`officerId`, `effectiveFrom`, `effectiveTo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MovementDocument` (
  `id` VARCHAR(191) NOT NULL,
  `movementId` VARCHAR(191) NOT NULL,
  `storageKey` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `MovementDocument_storageKey_key` (`storageKey`),
  `originalFilename` VARCHAR(191) NOT NULL,
  `contentType` VARCHAR(191) NOT NULL,
  `sizeBytes` INTEGER NOT NULL,
  `sha256` VARCHAR(191) NOT NULL,
  `scanStatus` VARCHAR(191) NOT NULL DEFAULT 'QUARANTINED',
  `documentType` VARCHAR(191) NOT NULL,
  `uploadedById` VARCHAR(191) NOT NULL,
  `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerEducation` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `educationLevel` VARCHAR(191) NULL,
  `qualification` VARCHAR(191) NULL,
  `kcseGrade` VARCHAR(191) NULL,
  `institution` VARCHAR(191) NULL,
  `completionDate` DATE NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Course` (
  `id` VARCHAR(191) NOT NULL,
  `courseName` VARCHAR(191) NOT NULL,
  `courseCode` VARCHAR(191) NULL,
  UNIQUE INDEX `Course_courseCode_key` (`courseCode`),
  `provider` VARCHAR(191) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerCourse` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `courseId` VARCHAR(191) NOT NULL,
  `startDate` DATE NULL,
  `completionDate` DATE NULL,
  `result` VARCHAR(191) NULL,
  `remarks` TEXT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerAward` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `awardName` TEXT NOT NULL,
  `awardDate` DATE NULL,
  `referenceNumber` VARCHAR(191) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerDisciplinaryRecord` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `recordType` VARCHAR(191) NOT NULL,
  `incidentDate` DATE NULL,
  `decisionDate` DATE NULL,
  `details` TEXT NOT NULL,
  `referenceNumber` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfficerExamination` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `examName` VARCHAR(191) NOT NULL,
  `examDate` DATE NULL,
  `score` VARCHAR(191) NULL,
  `result` VARCHAR(191) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `User` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `User_email_key` (`email`),
  `passwordHash` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT 1,
  `lastLoginAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Role` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `Role_name_key` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Permission` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `Permission_code_key` (`code`),
  `description` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserRole` (
  `userId` VARCHAR(191) NOT NULL,
  `roleId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RolePermission` (
  `roleId` VARCHAR(191) NOT NULL,
  `permissionId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `changedFields` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `AuditLog_entityType_entityId_createdAt_idx` (`entityType`, `entityId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RetirementRule` (
  `id` VARCHAR(191) NOT NULL,
  `rankId` VARCHAR(191) NULL,
  `retirementAge` INTEGER NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT 0,
  `approvedAt` DATETIME(3) NULL,
  `approvedById` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  INDEX `RetirementRule_rankId_isActive_effectiveFrom_effectiveTo_idx` (`rankId`, `isActive`, `effectiveFrom`, `effectiveTo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ImportBatch` (
  `id` VARCHAR(191) NOT NULL,
  `filename` VARCHAR(191) NOT NULL,
  `fileSha256` VARCHAR(191) NOT NULL,
  `uploadedById` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PREVIEW',
  `totalRows` INTEGER NOT NULL DEFAULT 0,
  `importedRows` INTEGER NOT NULL DEFAULT 0,
  `rejectedRows` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ImportBatch_fileSha256_idx` (`fileSha256`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ImportRow` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `sheetName` VARCHAR(191) NOT NULL,
  `rowNumber` INTEGER NOT NULL,
  `rawData` JSON NOT NULL,
  `unresolvedDates` JSON NOT NULL,
  `originalRankSpelling` VARCHAR(191) NULL,
  `specialistDesignation` VARCHAR(191) NULL,
  `verificationStatus` VARCHAR(191) NOT NULL DEFAULT 'UNVERIFIED',
  `validationErrors` JSON NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `officerId` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ImportRow_batchId_sheetName_rowNumber_key` (`batchId`, `sheetName`, `rowNumber`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SystemSetting` (
  `id` VARCHAR(191) NOT NULL,
  `settingKey` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `SystemSetting_settingKey_key` (`settingKey`),
  `settingValue` JSON NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `UserSession_tokenHash_key` (`tokenHash`),
  `csrfTokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `UserSession_expiresAt_idx` (`expiresAt`),
  INDEX `UserSession_userId_revokedAt_expiresAt_idx` (`userId`, `revokedAt`, `expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StrengthInclusionRule` (
  `id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `deploymentStatus` VARCHAR(191) NOT NULL,
  `includeNominal` BOOLEAN NOT NULL,
  `includeOperational` BOOLEAN NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT 0,
  `approvedAt` DATETIME(3) NULL,
  `approvedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `StrengthInclusionRule_status_deploymentStatus_isActive_effective` (`status`, `deploymentStatus`, `isActive`, `effectiveFrom`, `effectiveTo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Officer` ADD CONSTRAINT `Officer_countyId_fkey` FOREIGN KEY (`countyId`) REFERENCES `County` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Officer` ADD CONSTRAINT `Officer_ethnicityId_fkey` FOREIGN KEY (`ethnicityId`) REFERENCES `Ethnicity` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerServiceProfile` ADD CONSTRAINT `OfficerServiceProfile_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RankAlias` ADD CONSTRAINT `RankAlias_rankId_fkey` FOREIGN KEY (`rankId`) REFERENCES `Rank` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerRankHistory` ADD CONSTRAINT `OfficerRankHistory_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerRankHistory` ADD CONSTRAINT `OfficerRankHistory_rankId_fkey` FOREIGN KEY (`rankId`) REFERENCES `Rank` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerRankHistory` ADD CONSTRAINT `OfficerRankHistory_datesVerifiedById_fkey` FOREIGN KEY (`datesVerifiedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerFinancialDetail` ADD CONSTRAINT `OfficerFinancialDetail_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerFinancialDetail` ADD CONSTRAINT `OfficerFinancialDetail_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `Bank` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Unit` ADD CONSTRAINT `Unit_parentUnitId_fkey` FOREIGN KEY (`parentUnitId`) REFERENCES `Unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `SubUnit` ADD CONSTRAINT `SubUnit_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerAssignment` ADD CONSTRAINT `OfficerAssignment_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerAssignment` ADD CONSTRAINT `OfficerAssignment_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerAssignment` ADD CONSTRAINT `OfficerAssignment_subUnitId_fkey` FOREIGN KEY (`subUnitId`) REFERENCES `SubUnit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerAssignment` ADD CONSTRAINT `OfficerAssignment_datesVerifiedById_fkey` FOREIGN KEY (`datesVerifiedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `DeploymentRecord` ADD CONSTRAINT `DeploymentRecord_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `OfficerAssignment` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `DeploymentRecord` ADD CONSTRAINT `DeploymentRecord_datesVerifiedById_fkey` FOREIGN KEY (`datesVerifiedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RankEstablishment` ADD CONSTRAINT `RankEstablishment_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RankEstablishment` ADD CONSTRAINT `RankEstablishment_subUnitId_fkey` FOREIGN KEY (`subUnitId`) REFERENCES `SubUnit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RankEstablishment` ADD CONSTRAINT `RankEstablishment_rankId_fkey` FOREIGN KEY (`rankId`) REFERENCES `Rank` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_movementTypeId_fkey` FOREIGN KEY (`movementTypeId`) REFERENCES `MovementType` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_fromAssignmentId_fkey` FOREIGN KEY (`fromAssignmentId`) REFERENCES `OfficerAssignment` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_toAssignmentId_fkey` FOREIGN KEY (`toAssignmentId`) REFERENCES `OfficerAssignment` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_fromRankId_fkey` FOREIGN KEY (`fromRankId`) REFERENCES `Rank` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_toRankId_fkey` FOREIGN KEY (`toRankId`) REFERENCES `Rank` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PersonnelMovement` ADD CONSTRAINT `PersonnelMovement_datesVerifiedById_fkey` FOREIGN KEY (`datesVerifiedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerStatusHistory` ADD CONSTRAINT `OfficerStatusHistory_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerStatusHistory` ADD CONSTRAINT `OfficerStatusHistory_movementId_fkey` FOREIGN KEY (`movementId`) REFERENCES `PersonnelMovement` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerStatusHistory` ADD CONSTRAINT `OfficerStatusHistory_datesVerifiedById_fkey` FOREIGN KEY (`datesVerifiedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `MovementDocument` ADD CONSTRAINT `MovementDocument_movementId_fkey` FOREIGN KEY (`movementId`) REFERENCES `PersonnelMovement` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `MovementDocument` ADD CONSTRAINT `MovementDocument_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerEducation` ADD CONSTRAINT `OfficerEducation_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerCourse` ADD CONSTRAINT `OfficerCourse_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerCourse` ADD CONSTRAINT `OfficerCourse_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerAward` ADD CONSTRAINT `OfficerAward_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerDisciplinaryRecord` ADD CONSTRAINT `OfficerDisciplinaryRecord_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `OfficerExamination` ADD CONSTRAINT `OfficerExamination_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RetirementRule` ADD CONSTRAINT `RetirementRule_rankId_fkey` FOREIGN KEY (`rankId`) REFERENCES `Rank` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RetirementRule` ADD CONSTRAINT `RetirementRule_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ImportBatch` ADD CONSTRAINT `ImportBatch_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ImportRow` ADD CONSTRAINT `ImportRow_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `ImportBatch` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ImportRow` ADD CONSTRAINT `ImportRow_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `UserSession` ADD CONSTRAINT `UserSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `StrengthInclusionRule` ADD CONSTRAINT `StrengthInclusionRule_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
