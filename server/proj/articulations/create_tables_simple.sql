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
);