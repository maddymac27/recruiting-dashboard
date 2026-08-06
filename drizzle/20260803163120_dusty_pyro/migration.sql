ALTER TABLE `sync_runs` ADD `history_id` text;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `used_fallback` integer DEFAULT false NOT NULL;