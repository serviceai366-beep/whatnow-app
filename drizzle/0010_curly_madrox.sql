CREATE TABLE IF NOT EXISTS `document_studio_assistant_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "studio_assistant_usage_status_valid" CHECK("document_studio_assistant_usage"."status" in ('pending', 'completed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_assistant_usage_owner_idx` ON `document_studio_assistant_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `document_studio_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "studio_usage_status_valid" CHECK("document_studio_usage"."status" in ('pending', 'completed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `studio_usage_owner_idx` ON `document_studio_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `generated_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `generated_documents_owner_idx` ON `generated_documents` (`user_id`,`created_at`);
