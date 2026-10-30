CREATE TABLE `OfficerChange` (
 `id` VARCHAR(191) NOT NULL,
 `officerId` VARCHAR(191) NOT NULL,
 `eventType` VARCHAR(40) NOT NULL,
 `effectiveDate` DATE NULL,
 `status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
 `workbookCells` JSON NOT NULL,
 `revision` INTEGER NOT NULL DEFAULT 0,
 `sourceImportRowId` VARCHAR(191) NULL,
 `movementId` VARCHAR(191) NULL,
 `amendsId` VARCHAR(191) NULL,
 `targetUnitId` VARCHAR(191) NULL,
 `targetSubUnitId` VARCHAR(191) NULL,
 `targetRankId` VARCHAR(191) NULL,
 `recordedById` VARCHAR(191) NOT NULL,
 `approvedById` VARCHAR(191) NULL,
 `approvedAt` DATETIME(3) NULL,
 `appliedAt` DATETIME(3) NULL,
 `deletedAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `OfficerChange_sourceImportRowId_key` (`sourceImportRowId`),
 UNIQUE INDEX `OfficerChange_movementId_key` (`movementId`),
 INDEX `OfficerChange_effectiveDate_status_deletedAt_idx` (`effectiveDate`,`status`,`deletedAt`),
 INDEX `OfficerChange_officerId_effectiveDate_idx` (`officerId`,`effectiveDate`),
 CONSTRAINT `OfficerChange_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_sourceImportRowId_fkey` FOREIGN KEY (`sourceImportRowId`) REFERENCES `ImportRow` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_movementId_fkey` FOREIGN KEY (`movementId`) REFERENCES `PersonnelMovement` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_amendsId_fkey` FOREIGN KEY (`amendsId`) REFERENCES `OfficerChange` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_targetUnitId_fkey` FOREIGN KEY (`targetUnitId`) REFERENCES `Unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_targetSubUnitId_fkey` FOREIGN KEY (`targetSubUnitId`) REFERENCES `SubUnit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_targetRankId_fkey` FOREIGN KEY (`targetRankId`) REFERENCES `Rank` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT `OfficerChange_revision_check` CHECK (`revision` >= 0),
 CONSTRAINT `OfficerChange_status_check` CHECK (`status` IN ('DRAFT','SUBMITTED','APPLIED')),
 CONSTRAINT `OfficerChange_approval_check` CHECK (`status` <> 'APPLIED' OR (`effectiveDate` IS NOT NULL AND `movementId` IS NOT NULL AND `approvedAt` IS NOT NULL AND `approvedById` IS NOT NULL AND `appliedAt` IS NOT NULL AND `deletedAt` IS NULL)),
 CONSTRAINT `OfficerChange_subunit_check` CHECK (`targetSubUnitId` IS NULL OR `targetUnitId` IS NOT NULL)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TRIGGER `OfficerChange_applied_immutable` BEFORE UPDATE ON `OfficerChange` FOR EACH ROW
BEGIN
 IF OLD.`status` = 'APPLIED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Applied changes are immutable; create a linked corrective event'; END IF;
 IF OLD.`officerId` <> NEW.`officerId` THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Change officer identity is immutable'; END IF;
END;

CREATE TRIGGER `OfficerChange_applied_delete_guard` BEFORE DELETE ON `OfficerChange` FOR EACH ROW
BEGIN
 IF OLD.`status` = 'APPLIED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Applied changes cannot be deleted'; END IF;
END;
