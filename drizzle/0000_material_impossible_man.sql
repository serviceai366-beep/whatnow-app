CREATE TABLE `analysis_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analysis_rate_limits_reset_at_idx` ON `analysis_rate_limits` (`reset_at`);