CREATE TABLE `analysis_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_key` text NOT NULL,
	`consumed_at` integer NOT NULL,
	`cost_units` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analysis_usage_events_user_time_idx` ON `analysis_usage_events` (`user_key`,`consumed_at`);--> statement-breakpoint
CREATE INDEX `analysis_usage_events_time_idx` ON `analysis_usage_events` (`consumed_at`);