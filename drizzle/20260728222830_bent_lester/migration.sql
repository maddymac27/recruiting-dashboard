CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`company_id` integer NOT NULL,
	`role_title` text,
	`role_type_id` integer,
	`source_id` integer,
	`date_applied` integer,
	`current_stage_id` integer,
	`current_stage_since` integer,
	`last_inbound_event_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_applications_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`),
	CONSTRAINT `fk_applications_role_type_id_role_types_id_fk` FOREIGN KEY (`role_type_id`) REFERENCES `role_types`(`id`),
	CONSTRAINT `fk_applications_source_id_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`),
	CONSTRAINT `fk_applications_current_stage_id_stages_id_fk` FOREIGN KEY (`current_stage_id`) REFERENCES `stages`(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`canonical_name` text NOT NULL UNIQUE,
	`normalized_key` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`company_id` integer NOT NULL,
	`alias` text NOT NULL UNIQUE,
	`normalized_alias` text NOT NULL UNIQUE,
	CONSTRAINT `fk_company_aliases_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_applications` (
	`contact_id` integer NOT NULL,
	`application_id` integer NOT NULL,
	`linked_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `contact_applications_pk` PRIMARY KEY(`contact_id`, `application_id`),
	CONSTRAINT `fk_contact_applications_contact_id_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`),
	CONSTRAINT `fk_contact_applications_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`company_id` integer,
	`name` text NOT NULL,
	`role_title` text,
	`channel` text,
	`notes` text,
	`email` text,
	`linkedin_url` text,
	`relationship_type` text,
	`source` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_contacts_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`contact_id` integer NOT NULL,
	`application_id` integer,
	`occurred_at` integer NOT NULL,
	`channel` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_conversations_contact_id_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`),
	CONSTRAINT `fk_conversations_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`)
);
--> statement-breakpoint
CREATE TABLE `dead_letter` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`source_message_id` text,
	`raw_payload` text,
	`failed_stage` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`application_id` integer NOT NULL,
	`field_name` text NOT NULL,
	`value_text` text,
	`set_by_user_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_overrides_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`)
);
--> statement-breakpoint
CREATE TABLE `review_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`source_message_id` text,
	`candidate_application_id` integer,
	`confidence` real,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_review_queue_candidate_application_id_applications_id_fk` FOREIGN KEY (`candidate_application_id`) REFERENCES `applications`(`id`)
);
--> statement-breakpoint
CREATE TABLE `role_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`label` text NOT NULL UNIQUE,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`label` text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE `stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`label` text NOT NULL UNIQUE,
	`is_terminal` integer DEFAULT false NOT NULL,
	`outcome_label` text
);
--> statement-breakpoint
CREATE TABLE `status_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`application_id` integer NOT NULL,
	`stage_id` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`source_message_id` text,
	`confidence` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_status_events_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`),
	CONSTRAINT `fk_status_events_stage_id_stages_id_fk` FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`)
);
--> statement-breakpoint
CREATE INDEX `contact_applications_contact_idx` ON `contact_applications` (`contact_id`);--> statement-breakpoint
CREATE INDEX `contact_applications_application_idx` ON `contact_applications` (`application_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `overrides_application_field_unique` ON `overrides` (`application_id`,`field_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `status_events_source_message_id_unique` ON `status_events` (`source_message_id`);