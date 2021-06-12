USE articulations;

CREATE TABLE IF NOT EXISTS `objects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `source` varchar(255) DEFAULT NULL,
  `full_id` varchar(255) DEFAULT NULL,
  `category` varchar(255) DEFAULT NULL,
  `ignore_flag` boolean DEFAULT FALSE,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_objects_on_source` (`source`),
  KEY `index_objects_on_category` (`category`),
  KEY `index_objects_on_created_at` (`created_at`),
  KEY `index_objects_on_updated_at` (`updated_at`)
);

CREATE TABLE IF NOT EXISTS `parts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `label` varchar(255) DEFAULT NULL,
  `model_id` int NOT NULL,
  `part_index` varchar(255) DEFAULT NULL,
  `obb` mediumtext,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_parts_on_name` (`name`),
  KEY `index_parts_on_part_index` (`part_index`),
  KEY `index_parts_on_created_at` (`created_at`),
  KEY `index_parts_on_updated_at` (`updated_at`),
  UNIQUE KEY `index_parts_on_model_id_part_index` (`model_id`,`part_index`),
  CONSTRAINT fk_parts_model_id FOREIGN KEY (model_id) REFERENCES objects(id)
);

CREATE TABLE IF NOT EXISTS `joints` (
  `id` int NOT NULL AUTO_INCREMENT,
  `moving_part_id` int NOT NULL,
  `base_part_id` int NOT NULL,
  `contact_region` mediumtext,
  `joint_features` mediumtext,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_joints_on_created_at` (`created_at`),
  KEY `index_joints_on_updated_at` (`updated_at`),
  CONSTRAINT fk_joints_moving_part_id FOREIGN KEY (moving_part_id) REFERENCES parts(id),
  CONSTRAINT fk_joints_base_part_id FOREIGN KEY (base_part_id) REFERENCES parts(id)
);

CREATE TABLE IF NOT EXISTS `programs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `version` varchar(255) DEFAULT NULL,
  `motion_identification_rules` mediumtext,
  `motion_parameter_rules` mediumtext,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_programs_on_name` (`name`),
  KEY `index_programs_on_version` (`version`),
  KEY `index_programs_on_created_at` (`created_at`),
  KEY `index_programs_on_updated_at` (`updated_at`)
);

CREATE TABLE IF NOT EXISTS `programs_to_joints` (
  `id` int NOT NULL AUTO_INCREMENT,
  `program_id` int NOT NULL,
  `joint_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_programs_to_joints_on_created_at` (`created_at`),
  KEY `index_programs_to_joints_on_updated_at` (`updated_at`),
  CONSTRAINT fk_prg_to_jnt_program_id FOREIGN KEY (program_id) REFERENCES programs(id),
  CONSTRAINT fk_prg_to_jnt_joint_id FOREIGN KEY (joint_id) REFERENCES joints(id)
);

CREATE TABLE IF NOT EXISTS `rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `library_rule` boolean DEFAULT FALSE,
  `type` varchar(255) DEFAULT NULL,
  `motion_type` varchar(255) DEFAULT NULL,
  `rule_text` mediumtext,
  `created_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_rules_on_name` (`name`),
  KEY `index_rules_on_type` (`type`),
  KEY `index_rules_on_created_at` (`created_at`),
  KEY `index_rules_on_updated_at` (`updated_at`)
);

CREATE TABLE IF NOT EXISTS `collections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `version` varchar(255) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_collections_on_name` (`name`),
  KEY `index_collections_on_version` (`version`),
  KEY `index_collections_on_created_at` (`created_at`),
  KEY `index_collections_on_updated_at` (`updated_at`)
);

CREATE TABLE IF NOT EXISTS `collections_to_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `collection_id` int NOT NULL,
  `rule_id` int NOT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_collections_to_rules_on_created_at` (`created_at`),
  KEY `index_collections_to_rules_on_updated_at` (`updated_at`),
  CONSTRAINT fk_coll_to_rule_collection_id FOREIGN KEY (collection_id) REFERENCES collections(id),
  CONSTRAINT fk_coll_to_rule_rule_id FOREIGN KEY (rule_id) REFERENCES rules(id)
);

CREATE TABLE IF NOT EXISTS `annotated_object_articulations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` varchar(255) DEFAULT NULL,
  `worker_id` varchar(255) DEFAULT NULL,
  `model_id` int NULL,
  `full_id` varchar(255) DEFAULT NULL,
  `data` mediumtext,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_annotated_on_app_id` (`app_id`),
  KEY `index_annotated_on_worker_id` (`worker_id`),
  KEY `index_annotated_on_full_id` (`full_id`),
  KEY `index_annotated_on_created_at` (`created_at`),
  KEY `index_annotated_on_updated_at` (`updated_at`),
  UNIQUE KEY `index_articulations_on_model_id` (`model_id`),
  CONSTRAINT annotated_articulations_model_id FOREIGN KEY (model_id) REFERENCES objects(id)
);

CREATE TABLE IF NOT EXISTS `annotated_part_articulations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `object_art_id` int NULL,
  `app_id` varchar(255) DEFAULT NULL,
  `worker_id` varchar(255) DEFAULT NULL,
  `part_id` int NULL,
  `joint_id` int NULL,
  `data` mediumtext,
  `render_hash` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_annotated_on_app_id` (`app_id`),
  KEY `index_annotated_on_worker_id` (`worker_id`),
  KEY `index_annotated_on_created_at` (`created_at`),
  KEY `index_annotated_on_updated_at` (`updated_at`),
  CONSTRAINT fk_ann_part_art_object_art_id FOREIGN KEY (object_art_id) REFERENCES annotated_object_articulations(id),
  CONSTRAINT fk_ann_part_art_part_id FOREIGN KEY (part_id) REFERENCES parts(id),
  CONSTRAINT fk_ann_part_art_joint_id FOREIGN KEY (joint_id) REFERENCES joints(id)
);

CREATE TABLE IF NOT EXISTS `proposed_part_articulations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `part_id` int NOT NULL,
  `joint_id` int NOT NULL,
  `collection_id` int NULL,
  `axis_rule_id` int NULL,
  `range_rule_id` int NULL,
  `status` varchar(255) DEFAULT NULL,
  `render_hash` varchar(255) DEFAULT NULL,
  `filename` varchar(255) DEFAULT NULL,
  `axis_rule_score` DOUBLE,
  `range_rule_score` DOUBLE,
  `motion_type` varchar(255) DEFAULT NULL,
  `motion_axis` varchar(255) DEFAULT NULL,
  `motion_origin` varchar(255) DEFAULT NULL,
  `motion_min_range` varchar(255) DEFAULT NULL,
  `motion_max_range` varchar(255) DEFAULT NULL,
  `motion_ref` varchar(255) DEFAULT NULL,
  `motion_current_pose` varchar(255) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `index_proposed_on_axis_rule_score` (`axis_rule_score`),
  KEY `index_proposed_on_range_rule_score` (`range_rule_score`),
  KEY `index_proposed_on_status` (`status`),
  KEY `index_proposed_on_created_at` (`created_at`),
  KEY `index_proposed_on_updated_at` (`updated_at`),
  CONSTRAINT fk_prop_part_art_part_id FOREIGN KEY (part_id) REFERENCES parts(id),
  CONSTRAINT fk_prop_part_art_joint_id FOREIGN KEY (joint_id) REFERENCES joints(id),
  CONSTRAINT fk_prop_part_art_collection_id FOREIGN KEY (collection_id) REFERENCES collections(id),
  CONSTRAINT fk_prop_part_art_axis_rule_id FOREIGN KEY (axis_rule_id) REFERENCES rules(id),
  CONSTRAINT fk_prop_part_art_range_rule_id FOREIGN KEY (range_rule_id) REFERENCES rules(id)
);

CREATE TABLE IF NOT EXISTS `logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_name` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `endpoint` varchar(255) DEFAULT NULL,
  `msg` mediumtext,
  `level` varchar(255) DEFAULT NULL,
  `trace` varchar(255) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `user_annotation_session` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) DEFAULT NULL,
  `session_name` varchar(255) DEFAULT NULL,
  `start_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_time` timestamp,
  `comments` mediumtext,
  PRIMARY KEY (`id`)
);

CREATE OR REPLACE VIEW `all_parts`
AS
select distinct o.full_id as full_id, o.source as source, p.model_id as model_id,
o.category as object_category, p.id as part_id, p.label as part_label, p.part_index as part_index,
art.collection_id as collection_id, art.render_hash as render_hash
from objects o, parts p left outer join proposed_part_articulations art ON art.part_id = p.id
WHERE p.model_id = o.id and (o.ignore_flag is null or o.ignore_flag = 0);
