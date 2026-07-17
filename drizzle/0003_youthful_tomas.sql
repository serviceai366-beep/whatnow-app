CREATE TABLE `analysis_cost_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_key_hash` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`model` text NOT NULL,
	`cost_kind` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`cached_input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`estimated_cost_microusd` integer NOT NULL,
	CONSTRAINT "analysis_cost_events_input_nonnegative" CHECK("analysis_cost_events"."input_tokens" >= 0),
	CONSTRAINT "analysis_cost_events_cached_input_nonnegative" CHECK("analysis_cost_events"."cached_input_tokens" >= 0),
	CONSTRAINT "analysis_cost_events_output_nonnegative" CHECK("analysis_cost_events"."output_tokens" >= 0),
	CONSTRAINT "analysis_cost_events_cost_nonnegative" CHECK("analysis_cost_events"."estimated_cost_microusd" >= 0)
);
--> statement-breakpoint
CREATE INDEX `analysis_cost_events_time_idx` ON `analysis_cost_events` (`recorded_at`);--> statement-breakpoint
CREATE INDEX `analysis_cost_events_user_time_idx` ON `analysis_cost_events` (`user_key_hash`,`recorded_at`);