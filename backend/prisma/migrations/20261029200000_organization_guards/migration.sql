-- Internal serialization lock; this is not a personnel policy.
INSERT INTO `SystemSetting` (`id`, `settingKey`, `settingValue`)
VALUES ('organization-structure-mutex', '_internal.organization_mutex', JSON_OBJECT('purpose','organization serialization'))
ON DUPLICATE KEY UPDATE `settingKey` = VALUES(`settingKey`);
CREATE INDEX `RankEstablishment_unitId_subUnitId_rankId_interval_idx`
ON `RankEstablishment` (`unitId`, `subUnitId`, `rankId`, `effectiveFrom`, `effectiveTo`);

CREATE TRIGGER `DeploymentRecord_guard_insert` BEFORE INSERT ON `DeploymentRecord` FOR EACH ROW
BEGIN
 DECLARE officer_key VARCHAR(191);
 DECLARE locked_key VARCHAR(191);
 DECLARE starts DATE;
 DECLARE ends DATE;
 DECLARE overlaps INT DEFAULT 0;
 IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Deployment writes require READ COMMITTED isolation'; END IF;
 
 SELECT `officerId` INTO officer_key FROM `OfficerAssignment` WHERE `id`=NEW.`assignmentId`;
 SELECT `id` INTO locked_key FROM `Officer` WHERE `id`=officer_key FOR UPDATE;
 SELECT `effectiveFrom`, `effectiveTo` INTO starts, ends FROM `OfficerAssignment` WHERE `id`=NEW.`assignmentId`;
 IF starts IS NULL OR NEW.`effectiveFrom` < starts OR (ends IS NOT NULL AND (NEW.`effectiveTo` IS NULL OR NEW.`effectiveTo` > ends)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Deployment must be contained within assignment dates'; END IF;
 SELECT COUNT(*) INTO overlaps FROM `DeploymentRecord` d WHERE d.`assignmentId`=NEW.`assignmentId` AND d.`id`<>NEW.`id`
 AND (NEW.`effectiveTo` IS NULL OR d.`effectiveFrom` < NEW.`effectiveTo`)
 AND (d.`effectiveTo` IS NULL OR d.`effectiveTo` > NEW.`effectiveFrom`);
 IF overlaps > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Overlapping deployment history'; END IF;
END;

CREATE TRIGGER `RankEstablishment_guard_insert` BEFORE INSERT ON `RankEstablishment` FOR EACH ROW
BEGIN
 DECLARE locked_key VARCHAR(191);
 DECLARE overlaps INT DEFAULT 0;
 DECLARE valid_scope INT DEFAULT 0;
 IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Establishment writes require READ COMMITTED isolation'; END IF;
 
 SELECT `id` INTO locked_key FROM `Unit` WHERE `id`=NEW.`unitId` FOR UPDATE;
 IF NEW.`subUnitId` IS NOT NULL THEN
 SELECT COUNT(*) INTO valid_scope FROM `SubUnit` WHERE `id`=NEW.`subUnitId` AND `unitId`=NEW.`unitId`;
 IF valid_scope=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Sub-unit does not belong to establishment unit'; END IF;
 END IF;
 SELECT COUNT(*) INTO overlaps FROM `RankEstablishment` e WHERE e.`unitId`=NEW.`unitId` AND (e.`subUnitId` <=> NEW.`subUnitId`) AND e.`rankId`=NEW.`rankId` AND e.`id`<>NEW.`id`
 AND (NEW.`effectiveTo` IS NULL OR e.`effectiveFrom` < NEW.`effectiveTo`)
 AND (e.`effectiveTo` IS NULL OR e.`effectiveTo` > NEW.`effectiveFrom`);
 IF overlaps>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Overlapping approved establishment'; END IF;
END;

CREATE TRIGGER `DeploymentRecord_guard_update` BEFORE UPDATE ON `DeploymentRecord` FOR EACH ROW
BEGIN
 DECLARE officer_key VARCHAR(191);
 DECLARE locked_key VARCHAR(191);
 DECLARE starts DATE;
 DECLARE ends DATE;
 DECLARE overlaps INT DEFAULT 0;
 IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Deployment writes require READ COMMITTED isolation'; END IF;
 IF OLD.`assignmentId` <> NEW.`assignmentId` OR OLD.`effectiveFrom` <> NEW.`effectiveFrom` OR OLD.`deploymentStatus` <> NEW.`deploymentStatus` OR NOT (OLD.`locationLabel` <=> NEW.`locationLabel`) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Deployment history identity is immutable'; END IF;
 SELECT `officerId` INTO officer_key FROM `OfficerAssignment` WHERE `id`=NEW.`assignmentId`;
 SELECT `id` INTO locked_key FROM `Officer` WHERE `id`=officer_key FOR UPDATE;
 SELECT `effectiveFrom`, `effectiveTo` INTO starts, ends FROM `OfficerAssignment` WHERE `id`=NEW.`assignmentId`;
 IF starts IS NULL OR NEW.`effectiveFrom` < starts OR (ends IS NOT NULL AND (NEW.`effectiveTo` IS NULL OR NEW.`effectiveTo` > ends)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Deployment must be contained within assignment dates'; END IF;
 SELECT COUNT(*) INTO overlaps FROM `DeploymentRecord` d WHERE d.`assignmentId`=NEW.`assignmentId` AND d.`id`<>NEW.`id`
 AND (NEW.`effectiveTo` IS NULL OR d.`effectiveFrom` < NEW.`effectiveTo`)
 AND (d.`effectiveTo` IS NULL OR d.`effectiveTo` > NEW.`effectiveFrom`);
 IF overlaps > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Overlapping deployment history'; END IF;
END;

CREATE TRIGGER `RankEstablishment_guard_update` BEFORE UPDATE ON `RankEstablishment` FOR EACH ROW
BEGIN
 DECLARE locked_key VARCHAR(191);
 DECLARE overlaps INT DEFAULT 0;
 DECLARE valid_scope INT DEFAULT 0;
 IF @@transaction_isolation <> 'READ-COMMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Establishment writes require READ COMMITTED isolation'; END IF;
 IF OLD.`unitId` <> NEW.`unitId` OR NOT (OLD.`subUnitId` <=> NEW.`subUnitId`) OR OLD.`rankId` <> NEW.`rankId` OR OLD.`effectiveFrom` <> NEW.`effectiveFrom` OR OLD.`authorizedStrength` <> NEW.`authorizedStrength` THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Approved establishment history is immutable'; END IF;
 SELECT `id` INTO locked_key FROM `Unit` WHERE `id`=NEW.`unitId` FOR UPDATE;
 IF NEW.`subUnitId` IS NOT NULL THEN
 SELECT COUNT(*) INTO valid_scope FROM `SubUnit` WHERE `id`=NEW.`subUnitId` AND `unitId`=NEW.`unitId`;
 IF valid_scope=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Sub-unit does not belong to establishment unit'; END IF;
 END IF;
 SELECT COUNT(*) INTO overlaps FROM `RankEstablishment` e WHERE e.`unitId`=NEW.`unitId` AND (e.`subUnitId` <=> NEW.`subUnitId`) AND e.`rankId`=NEW.`rankId` AND e.`id`<>NEW.`id`
 AND (NEW.`effectiveTo` IS NULL OR e.`effectiveFrom` < NEW.`effectiveTo`)
 AND (e.`effectiveTo` IS NULL OR e.`effectiveTo` > NEW.`effectiveFrom`);
 IF overlaps>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Overlapping approved establishment'; END IF;
END;
