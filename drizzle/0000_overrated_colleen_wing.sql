CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_account_unique` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`blocked_until` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `external_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`external_url` text,
	`media_type` text,
	`list_memberships` text DEFAULT '[]' NOT NULL,
	`remote_status` text,
	`remote_updated_at` integer,
	`remote_created_at` integer,
	`last_seen_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`source_data` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_refs_provider_external_id_unique` ON `external_refs` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `external_refs_node_id_idx` ON `external_refs` (`node_id`);--> statement-breakpoint
CREATE INDEX `external_refs_provider_idx` ON `external_refs` (`provider`,`node_id`);--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_key` text NOT NULL,
	`node_id` text NOT NULL,
	`role` text NOT NULL,
	`path` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`checksum` text NOT NULL,
	`source_url` text,
	`source_provider` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`managed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `images_node_id_idx` ON `images` (`node_id`,`role`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `images_asset_role_unique` ON `images` (`asset_key`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `images_single_main_per_node` ON `images` (`node_id`) WHERE "images"."role" = 'main';--> statement-breakpoint
CREATE TABLE `node_attributes` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`value_type` text DEFAULT 'text' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_provider` text,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_attributes_unique` ON `node_attributes` (`node_id`,`key`,`value`);--> statement-breakpoint
CREATE INDEX `node_attributes_node_id_idx` ON `node_attributes` (`node_id`);--> statement-breakpoint
CREATE INDEX `node_attributes_provider_idx` ON `node_attributes` (`source_provider`);--> statement-breakpoint
CREATE TABLE `node_links` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `node_links_node_id_idx` ON `node_links` (`node_id`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`media_type` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'NOT_STARTED' NOT NULL,
	`release_year` integer,
	`nsfw` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`notes` text,
	`override_fields` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nodes_status_idx` ON `nodes` (`status`);--> statement-breakpoint
CREATE INDEX `nodes_display_name_idx` ON `nodes` (`display_name`);--> statement-breakpoint
CREATE INDEX `nodes_library_filter_idx` ON `nodes` (`media_type`,`status`,`hidden`,`nsfw`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `storage_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`label` text NOT NULL,
	`medium` text DEFAULT 'physical' NOT NULL,
	`platform` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_provider` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storage_locations_node_id_idx` ON `storage_locations` (`node_id`);--> statement-breakpoint
CREATE INDEX `storage_locations_medium_idx` ON `storage_locations` (`medium`);--> statement-breakpoint
CREATE INDEX `storage_locations_provider_idx` ON `storage_locations` (`source_provider`);--> statement-breakpoint
CREATE TABLE `sync_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`user_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`external_account_id` text,
	`display_name` text,
	`access_token_encrypted` text,
	`refresh_token_encrypted` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`config_json` text DEFAULT '{}' NOT NULL,
	`profile_json` text DEFAULT '{}' NOT NULL,
	`last_synced_at` integer,
	`last_successful_sync_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_accounts_provider_unique` ON `sync_accounts` (`provider`);--> statement-breakpoint
CREATE INDEX `sync_accounts_provider_idx` ON `sync_accounts` (`provider`);--> statement-breakpoint
CREATE TABLE `sync_leases` (
	`provider` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`heartbeat_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	`stats_json` text DEFAULT '{}' NOT NULL,
	`error_text` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_runs_provider_idx` ON `sync_runs` (`provider`,`started_at`);--> statement-breakpoint
CREATE INDEX `sync_runs_status_idx` ON `sync_runs` (`status`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);