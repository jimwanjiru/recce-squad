ALTER TABLE `OfficerChange` ADD CONSTRAINT `OfficerChange_independent_approval` CHECK (`approvedById` IS NULL OR `approvedById` <> `recordedById`);
