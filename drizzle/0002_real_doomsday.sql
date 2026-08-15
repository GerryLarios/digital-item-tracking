CREATE TABLE `detail_sync_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`node_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`warning_text` text,
	`error_text` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `detail_sync_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `detail_sync_items_job_node_unique` ON `detail_sync_items` (`job_id`,`node_id`);--> statement-breakpoint
CREATE INDEX `detail_sync_items_claim_idx` ON `detail_sync_items` (`job_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `detail_sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`active_key` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `detail_sync_jobs_active_key_unique` ON `detail_sync_jobs` (`active_key`);--> statement-breakpoint
CREATE INDEX `detail_sync_jobs_status_idx` ON `detail_sync_jobs` (`status`,`created_at`);