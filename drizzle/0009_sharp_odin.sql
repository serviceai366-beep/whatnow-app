CREATE TABLE `document_followups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`analysis_id` text NOT NULL,
	`question` text NOT NULL,
	`selected_text` text,
	`answer` text,
	`evidence_ids` text,
	`uncertain` integer,
	`safety_notice` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "document_followups_status_valid" CHECK("document_followups"."status" in ('pending', 'completed'))
);
--> statement-breakpoint
CREATE INDEX `document_followups_owner_analysis_idx` ON `document_followups` (`user_id`,`analysis_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `document_followups_created_idx` ON `document_followups` (`created_at`);--> statement-breakpoint
CREATE INDEX `document_followups_owner_created_idx` ON `document_followups` (`user_id`,`created_at`);