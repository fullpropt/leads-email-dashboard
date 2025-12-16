CREATE TABLE `auto_send_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ativo` int NOT NULL DEFAULT 0,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	`atualizado_em` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auto_send_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `email_templates` ADD `schedule_enabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `email_templates` ADD `schedule_time` varchar(5);--> statement-breakpoint
ALTER TABLE `email_templates` ADD `schedule_interval` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `email_templates` ADD `schedule_interval_type` varchar(10) DEFAULT 'days' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_templates` ADD `last_sent_at` timestamp;--> statement-breakpoint
ALTER TABLE `email_templates` ADD `next_send_at` timestamp;