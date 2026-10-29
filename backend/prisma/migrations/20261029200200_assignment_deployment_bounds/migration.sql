-- Preserve contained deployments when future assignment workflows close an interval.
CREATE TRIGGER `OfficerAssignment_deployment_bounds_update` BEFORE UPDATE ON `OfficerAssignment` FOR EACH ROW
BEGIN
 DECLARE outside_count INT DEFAULT 0;
 SELECT COUNT(*) INTO outside_count FROM `DeploymentRecord` d WHERE d.`assignmentId`=NEW.`id`
 AND (d.`effectiveFrom` < NEW.`effectiveFrom` OR (NEW.`effectiveTo` IS NOT NULL AND (d.`effectiveTo` IS NULL OR d.`effectiveTo` > NEW.`effectiveTo`)));
 IF outside_count > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Assignment dates cannot strand deployment history'; END IF;
END;
