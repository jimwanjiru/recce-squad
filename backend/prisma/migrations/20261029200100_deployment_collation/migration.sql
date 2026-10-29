-- Match variable collation to the referenced ID columns, independent of the database default.

DROP TRIGGER IF EXISTS `DeploymentRecord_guard_insert`;

CREATE TRIGGER `DeploymentRecord_guard_insert` BEFORE INSERT ON `DeploymentRecord` FOR EACH ROW
BEGIN
 DECLARE officer_key VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 DECLARE locked_key VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
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

DROP TRIGGER IF EXISTS `DeploymentRecord_guard_update`;

CREATE TRIGGER `DeploymentRecord_guard_update` BEFORE UPDATE ON `DeploymentRecord` FOR EACH ROW
BEGIN
 DECLARE officer_key VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 DECLARE locked_key VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
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
