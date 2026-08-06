CREATE TABLE `ingested_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`message_id` text NOT NULL,
	`outcome` text NOT NULL,
	`application_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_ingested_messages_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`new_count` integer DEFAULT 0 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`dead_letter_count` integer DEFAULT 0 NOT NULL,
	`error_message` text
);
--> statement-breakpoint
ALTER TABLE `dead_letter` ADD `type` text;--> statement-breakpoint
ALTER TABLE `dead_letter` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `dead_letter` ADD `sender` text;--> statement-breakpoint
ALTER TABLE `dead_letter` ADD `subject` text;--> statement-breakpoint
ALTER TABLE `dead_letter` ADD `resolved_at` integer;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `type` text;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `sender` text;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `subject` text;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `body_text` text;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `parsed_company` text;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `parsed_role_title` text;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `parsed_stage_label` text;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `parsed_event_date` integer;--> statement-breakpoint
ALTER TABLE `review_queue` ADD `resolved_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `ingested_messages_message_id_unique` ON `ingested_messages` (`message_id`);