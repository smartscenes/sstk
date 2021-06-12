CREATE TABLE IF NOT EXISTS `annotations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `appId` varchar(255) DEFAULT NULL,
  `sessionId` varchar(255) DEFAULT NULL,
  `workerId` varchar(255) DEFAULT NULL,
  `itemId` varchar(255) DEFAULT NULL,
  `condition` varchar(255) DEFAULT NULL,
  `data` mediumtext,
  `preview_data` mediumtext,
  `progress` float DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `verified` boolean DEFAULT FALSE,
  `imported` boolean DEFAULT FALSE,
  `code` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `task` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `taskMode` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `index_annotations_on_appId` (`appId`),
  KEY `index_annotations_on_sessionId` (`sessionId`),
  KEY `index_annotations_on_workerId` (`workerId`),
  KEY `index_annotations_on_itemId` (`itemId`),
  KEY `index_annotations_on_condition` (`condition`),
  KEY `index_annotations_on_progress` (`progress`),
  KEY `index_annotations_on_status` (`status`),
  KEY `index_annotations_on_imported` (`imported`),
  KEY `index_annotations_on_verified` (`verified`),
  KEY `index_annotations_on_task` (`task`),
  KEY `index_annotations_on_created_at` (`created_at`),
  KEY `index_annotations_on_updated_at` (`updated_at`),
  KEY `index_annotations_on_type` (`type`)
);

CREATE VIEW current_annotations AS
SELECT anns.id, anns.appId, anns.sessionId, anns.workerId, anns.itemId,
       anns.condition, anns.data, anns.preview_data,
       anns.progress, anns.status, anns.notes, anns.verified, anns.imported, anns.code,
       anns.created_at, anns.updated_at, anns.task, anns.type, anns.taskMode,
       x.ids
FROM (
         SELECT itemId, max(id) as id, group_concat(id) as ids
         FROM annotations group by itemId
     ) as x inner join annotations as anns on anns.itemId = x.itemId and anns.id = x.id;

CREATE VIEW current_part_annotations AS
SELECT parts.id, parts.appId, parts.sessionId, parts.workerId, parts.modelId,
       parts.partSetId, parts.partId, parts.label, parts.labelType,
       parts.created_at, parts.updated_at, parts.annId,
       parts.condition, parts.status, parts.verified,
       parts.obb, parts.data
FROM (
         SELECT id FROM current_annotations where type = 'part'
     ) as anns inner join part_annotations as parts on anns.id = parts.annId;

CREATE TABLE IF NOT EXISTS part_annotations
(
  `id` int(11) NOT NULL AUTO_INCREMENT,
  appId varchar(255) null,
  sessionId varchar(255) null,
  workerId varchar(255) null,
  modelId varchar(255) null,
  partSetId varchar(255) null,
  partId text null,
  label varchar(255) null,
  labelType varchar(255) null,
  created_at timestamp default CURRENT_TIMESTAMP not null,
  updated_at timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
  annId int null,
  `condition` varchar(255) null,
  status varchar(255) null,
  notes varchar(255) null,
  verified tinyint(1) default '0' null,
  obb mediumtext null,
  data mediumtext null,
  PRIMARY KEY (`id`),
  KEY `index_part_annotations_on_appId` (`appId`),
  KEY `index_part_annotations_on_sessionId` (`sessionId`),
  KEY `index_part_annotations_on_workerId` (`workerId`),
  KEY `index_part_annotations_on_modelId` (`modelId`),
  KEY `index_part_annotations_on_label` (`label`),
  KEY `index_part_annotations_on_labelType` (`labelType`),
  KEY `index_part_annotations_on_status` (`status`),
  KEY `index_part_annotations_on_condition` (`condition`),
  KEY `index_part_annotations_on_annId` (`annId`),
  KEY `index_part_annotations_on_created_at` (`created_at`),
  KEY `index_part_annotations_on_updated_at` (`updated_at`)
);
