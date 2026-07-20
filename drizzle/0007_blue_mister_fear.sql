ALTER TABLE `support_conversations` ADD `priority` text DEFAULT 'normal' NOT NULL CHECK (`priority` in ('low', 'normal', 'high', 'urgent'));--> statement-breakpoint
ALTER TABLE `support_conversations` ADD `contact_email` text;--> statement-breakpoint
ALTER TABLE `support_conversations` ADD `locale` text DEFAULT 'en' NOT NULL CHECK (`locale` in ('en', 'ru', 'lv'));--> statement-breakpoint
CREATE TABLE `support_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `support_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `support_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "support_attachments_mime_valid" CHECK("support_attachments"."mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "support_attachments_size_positive" CHECK("support_attachments"."size_bytes" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX `support_attachments_object_key_unique` ON `support_attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `support_attachments_conversation_created_idx` ON `support_attachments` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_attachments_message_idx` ON `support_attachments` (`message_id`);
