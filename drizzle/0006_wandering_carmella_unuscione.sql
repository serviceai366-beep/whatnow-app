CREATE TABLE `support_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_message_at` integer NOT NULL,
	CONSTRAINT "support_conversations_category_valid" CHECK("support_conversations"."category" in ('question', 'bug', 'feature')),
	CONSTRAINT "support_conversations_status_valid" CHECK("support_conversations"."status" in ('open', 'waiting_for_user', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX `support_conversations_user_updated_idx` ON `support_conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `support_conversations_updated_idx` ON `support_conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `support_message_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_message_events_user_created_idx` ON `support_message_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_type` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `support_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "support_messages_sender_valid" CHECK("support_messages"."sender_type" in ('user', 'support'))
);
--> statement-breakpoint
CREATE INDEX `support_messages_conversation_created_idx` ON `support_messages` (`conversation_id`,`created_at`);