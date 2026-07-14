CREATE TABLE `user_file_upload_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	CONSTRAINT "user_file_upload_events_size_positive" CHECK("user_file_upload_events"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE INDEX `user_file_upload_events_user_time_idx` ON `user_file_upload_events` (`user_id`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `user_file_upload_events_time_idx` ON `user_file_upload_events` (`uploaded_at`);--> statement-breakpoint
CREATE TABLE `user_files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`extension` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "user_files_size_positive" CHECK("user_files"."size_bytes" > 0),
	CONSTRAINT "user_files_status_valid" CHECK("user_files"."status" in ('pending', 'ready'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_files_object_key_unique` ON `user_files` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_files_user_sha256_unique` ON `user_files` (`user_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `user_files_user_created_idx` ON `user_files` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_files_status_updated_idx` ON `user_files` (`status`,`updated_at`);