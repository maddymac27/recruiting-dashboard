CREATE TABLE `outreach_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`contact_id` integer NOT NULL,
	`company_id` integer NOT NULL,
	`channel` text NOT NULL,
	`purpose` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`sent_date` integer NOT NULL,
	`responded` integer DEFAULT false NOT NULL,
	`outcome` text,
	`source_message_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_outreach_messages_contact_id_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`),
	CONSTRAINT `fk_outreach_messages_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_messages_source_message_id_unique` ON `outreach_messages` (`source_message_id`);