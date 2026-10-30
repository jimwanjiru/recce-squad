CREATE TABLE `OfficerRankSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `officerId` VARCHAR(191) NOT NULL,
  `sourceRowId` VARCHAR(191) NOT NULL,
  `rank1` TEXT NOT NULL,
  `rank2` TEXT NOT NULL,
  `rankCode` VARCHAR(32) NOT NULL,
  `seededAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `seededById` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `OfficerRankSnapshot_officerId_key` (`officerId`),
  UNIQUE INDEX `OfficerRankSnapshot_sourceRowId_key` (`sourceRowId`),
  INDEX `OfficerRankSnapshot_rankCode_officerId_idx` (`rankCode`, `officerId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `OfficerRankSnapshot_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `OfficerRankSnapshot_sourceRowId_fkey` FOREIGN KEY (`sourceRowId`) REFERENCES `ImportRow` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `OfficerRankSnapshot_seededById_fkey` FOREIGN KEY (`seededById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `OfficerRankSnapshot_rank_code_check` CHECK (`rankCode` IN ('AIG','CP','SSP','SP','ASP','CI','IP','S/SGT','SGT','CPL','PC','S/AIG','RSM','UNKNOWN'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
