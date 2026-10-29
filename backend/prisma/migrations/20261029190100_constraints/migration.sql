ALTER TABLE `OfficerAssignment` ADD CONSTRAINT `OfficerAssignment_valid_interval` CHECK (`effectiveTo` IS NULL OR `effectiveTo` > `effectiveFrom`);

ALTER TABLE `OfficerRankHistory` ADD CONSTRAINT `OfficerRankHistory_valid_interval` CHECK (`effectiveTo` IS NULL OR `effectiveTo` > `effectiveFrom`);

ALTER TABLE `OfficerStatusHistory` ADD CONSTRAINT `OfficerStatusHistory_valid_interval` CHECK (`effectiveTo` IS NULL OR `effectiveTo` > `effectiveFrom`);

ALTER TABLE `DeploymentRecord` ADD CONSTRAINT `DeploymentRecord_valid_interval` CHECK (`effectiveTo` IS NULL OR `effectiveTo` > `effectiveFrom`);

ALTER TABLE `RankEstablishment` ADD CONSTRAINT `RankEstablishment_valid_interval` CHECK (`effectiveTo` IS NULL OR `effectiveTo` > `effectiveFrom`);

ALTER TABLE `RetirementRule` ADD CONSTRAINT `RetirementRule_valid_interval` CHECK (`effectiveTo` IS NULL OR `effectiveTo` > `effectiveFrom`);

ALTER TABLE `StrengthInclusionRule` ADD CONSTRAINT `StrengthInclusionRule_valid_interval` CHECK (`effectiveTo` IS NULL OR `effectiveTo` > `effectiveFrom`);

ALTER TABLE `RankEstablishment` ADD CONSTRAINT `RankEstablishment_valid_amount` CHECK (`authorizedStrength` >= 0);

ALTER TABLE `RetirementRule` ADD CONSTRAINT `RetirementRule_valid_amount` CHECK (`retirementAge` > 0);

ALTER TABLE `RetirementRule` ADD CONSTRAINT `RetirementRule_approval_required` CHECK (`isActive` = FALSE OR (`approvedAt` IS NOT NULL AND `approvedById` IS NOT NULL));

ALTER TABLE `StrengthInclusionRule` ADD CONSTRAINT `StrengthInclusionRule_approval_required` CHECK (`isActive` = FALSE OR (`approvedAt` IS NOT NULL AND `approvedById` IS NOT NULL));

CREATE TRIGGER `OfficerAssignment_no_overlap_insert` BEFORE INSERT ON `OfficerAssignment` FOR EACH ROW
BEGIN
  DECLARE overlaps INT DEFAULT 0;
  IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Personnel history writes require READ COMMITTED isolation'; END IF;
  UPDATE `Officer` SET `version` = `version` + 1 WHERE `id` = NEW.`officerId`;
  SELECT COUNT(*) INTO overlaps FROM `OfficerAssignment` h
    WHERE h.`officerId` = NEW.`officerId` AND h.`id` <> NEW.`id` AND h.`isPrimary` = TRUE
      AND (NEW.`effectiveTo` IS NULL OR h.`effectiveFrom` < NEW.`effectiveTo`)
      AND (h.`effectiveTo` IS NULL OR h.`effectiveTo` > NEW.`effectiveFrom`);
  IF NEW.`isPrimary` = TRUE AND overlaps > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping verified personnel history';
  END IF;
END;

CREATE TRIGGER `OfficerAssignment_no_overlap_update` BEFORE UPDATE ON `OfficerAssignment` FOR EACH ROW
BEGIN
  DECLARE overlaps INT DEFAULT 0;
  IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Personnel history writes require READ COMMITTED isolation'; END IF;
  IF OLD.`officerId` <> NEW.`officerId` THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'History officer identity is immutable'; END IF;
  UPDATE `Officer` SET `version` = `version` + 1 WHERE `id` = NEW.`officerId`;
  SELECT COUNT(*) INTO overlaps FROM `OfficerAssignment` h
    WHERE h.`officerId` = NEW.`officerId` AND h.`id` <> NEW.`id` AND h.`isPrimary` = TRUE
      AND (NEW.`effectiveTo` IS NULL OR h.`effectiveFrom` < NEW.`effectiveTo`)
      AND (h.`effectiveTo` IS NULL OR h.`effectiveTo` > NEW.`effectiveFrom`);
  IF NEW.`isPrimary` = TRUE AND overlaps > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping verified personnel history';
  END IF;
END;

CREATE TRIGGER `OfficerRankHistory_no_overlap_insert` BEFORE INSERT ON `OfficerRankHistory` FOR EACH ROW
BEGIN
  DECLARE overlaps INT DEFAULT 0;
  IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Personnel history writes require READ COMMITTED isolation'; END IF;
  UPDATE `Officer` SET `version` = `version` + 1 WHERE `id` = NEW.`officerId`;
  SELECT COUNT(*) INTO overlaps FROM `OfficerRankHistory` h
    WHERE h.`officerId` = NEW.`officerId` AND h.`id` <> NEW.`id`
      AND (NEW.`effectiveTo` IS NULL OR h.`effectiveFrom` < NEW.`effectiveTo`)
      AND (h.`effectiveTo` IS NULL OR h.`effectiveTo` > NEW.`effectiveFrom`);
  IF overlaps > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping verified personnel history';
  END IF;
END;

CREATE TRIGGER `OfficerRankHistory_no_overlap_update` BEFORE UPDATE ON `OfficerRankHistory` FOR EACH ROW
BEGIN
  DECLARE overlaps INT DEFAULT 0;
  IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Personnel history writes require READ COMMITTED isolation'; END IF;
  IF OLD.`officerId` <> NEW.`officerId` THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'History officer identity is immutable'; END IF;
  UPDATE `Officer` SET `version` = `version` + 1 WHERE `id` = NEW.`officerId`;
  SELECT COUNT(*) INTO overlaps FROM `OfficerRankHistory` h
    WHERE h.`officerId` = NEW.`officerId` AND h.`id` <> NEW.`id`
      AND (NEW.`effectiveTo` IS NULL OR h.`effectiveFrom` < NEW.`effectiveTo`)
      AND (h.`effectiveTo` IS NULL OR h.`effectiveTo` > NEW.`effectiveFrom`);
  IF overlaps > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping verified personnel history';
  END IF;
END;

CREATE TRIGGER `OfficerStatusHistory_no_overlap_insert` BEFORE INSERT ON `OfficerStatusHistory` FOR EACH ROW
BEGIN
  DECLARE overlaps INT DEFAULT 0;
  IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Personnel history writes require READ COMMITTED isolation'; END IF;
  UPDATE `Officer` SET `version` = `version` + 1 WHERE `id` = NEW.`officerId`;
  SELECT COUNT(*) INTO overlaps FROM `OfficerStatusHistory` h
    WHERE h.`officerId` = NEW.`officerId` AND h.`id` <> NEW.`id`
      AND (NEW.`effectiveTo` IS NULL OR h.`effectiveFrom` < NEW.`effectiveTo`)
      AND (h.`effectiveTo` IS NULL OR h.`effectiveTo` > NEW.`effectiveFrom`);
  IF overlaps > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping verified personnel history';
  END IF;
END;

CREATE TRIGGER `OfficerStatusHistory_no_overlap_update` BEFORE UPDATE ON `OfficerStatusHistory` FOR EACH ROW
BEGIN
  DECLARE overlaps INT DEFAULT 0;
  IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Personnel history writes require READ COMMITTED isolation'; END IF;
  IF OLD.`officerId` <> NEW.`officerId` THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'History officer identity is immutable'; END IF;
  UPDATE `Officer` SET `version` = `version` + 1 WHERE `id` = NEW.`officerId`;
  SELECT COUNT(*) INTO overlaps FROM `OfficerStatusHistory` h
    WHERE h.`officerId` = NEW.`officerId` AND h.`id` <> NEW.`id`
      AND (NEW.`effectiveTo` IS NULL OR h.`effectiveFrom` < NEW.`effectiveTo`)
      AND (h.`effectiveTo` IS NULL OR h.`effectiveTo` > NEW.`effectiveFrom`);
  IF overlaps > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Overlapping verified personnel history';
  END IF;
END;

CREATE TRIGGER `OfficerAssignment_unit_guard_insert` BEFORE INSERT ON `OfficerAssignment` FOR EACH ROW
BEGIN
  DECLARE valid_unit INT DEFAULT 0;
  IF NEW.`subUnitId` IS NOT NULL THEN
    SELECT COUNT(*) INTO valid_unit FROM `SubUnit` WHERE `id` = NEW.`subUnitId` AND `unitId` = NEW.`unitId`;
    IF valid_unit = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sub-unit does not belong to assignment unit'; END IF;
  END IF;
END;

CREATE TRIGGER `OfficerAssignment_unit_guard_update` BEFORE UPDATE ON `OfficerAssignment` FOR EACH ROW
BEGIN
  DECLARE valid_unit INT DEFAULT 0;
  IF NEW.`subUnitId` IS NOT NULL THEN
    SELECT COUNT(*) INTO valid_unit FROM `SubUnit` WHERE `id` = NEW.`subUnitId` AND `unitId` = NEW.`unitId`;
    IF valid_unit = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sub-unit does not belong to assignment unit'; END IF;
  END IF;
END;
