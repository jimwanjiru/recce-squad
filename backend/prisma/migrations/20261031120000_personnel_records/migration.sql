ALTER TABLE `Officer` ADD COLUMN `assignedDuties` TEXT NULL;
CREATE TABLE `OfficerPersonnelData` (
  `officerId` VARCHAR(191) NOT NULL,
  `sourceRowId` VARCHAR(191) NOT NULL,
  `details` JSON NOT NULL,
  `encryptedFinance` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`officerId`),
  UNIQUE INDEX `OfficerPersonnelData_sourceRowId_key` (`sourceRowId`),
  CONSTRAINT `OfficerPersonnelData_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `OfficerPersonnelData_sourceRowId_fkey` FOREIGN KEY (`sourceRowId`) REFERENCES `ImportRow` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `PersonnelSummaryRecord` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `section` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `cells` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PersonnelSummaryRecord_batchId_section_position_key` (`batchId`, `section`, `position`),
  CONSTRAINT `PersonnelSummaryRecord_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `ImportBatch` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
