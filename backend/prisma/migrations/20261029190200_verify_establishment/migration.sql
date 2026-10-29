-- No establishment values are seeded. Any future migration of populated legacy tables
-- must stage and verify their source dates before applying equivalent NOT NULL fields.
ALTER TABLE `RankEstablishment`
  ADD COLUMN `datesVerifiedAt` DATETIME(3) NOT NULL,
  ADD COLUMN `datesVerifiedById` VARCHAR(191) NOT NULL;
ALTER TABLE `RankEstablishment` ADD CONSTRAINT `RankEstablishment_datesVerifiedById_fkey`
  FOREIGN KEY (`datesVerifiedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
