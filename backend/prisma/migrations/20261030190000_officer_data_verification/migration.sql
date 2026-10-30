ALTER TABLE `Officer`
  ADD COLUMN `verificationStatus` VARCHAR(191) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN `verifiedAt` DATETIME(3) NULL,
  ADD COLUMN `verifiedById` VARCHAR(191) NULL,
  ADD INDEX `Officer_verificationStatus_deletedAt_idx` (`verificationStatus`, `deletedAt`),
  ADD CONSTRAINT `Officer_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `Officer_verification_metadata_check` CHECK (
    (`verificationStatus` = 'UNVERIFIED' AND `verifiedAt` IS NULL AND `verifiedById` IS NULL)
    OR (`verificationStatus` = 'VERIFIED' AND `verifiedAt` IS NOT NULL AND `verifiedById` IS NOT NULL)
  );
