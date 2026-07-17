CREATE TABLE `stripe_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stripe_webhook_events_received_idx` ON `stripe_webhook_events` (`received_at`);--> statement-breakpoint
CREATE TABLE `user_subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`account_reference` text NOT NULL,
	`plan_code` text DEFAULT 'free' NOT NULL,
	`state` text DEFAULT 'free' NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`test_mode` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "user_subscriptions_plan_valid" CHECK("user_subscriptions"."plan_code" in ('free', 'pro')),
	CONSTRAINT "user_subscriptions_state_valid" CHECK("user_subscriptions"."state" in ('free', 'test_checkout_pending', 'active', 'past_due', 'canceled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_subscriptions_account_reference_unique` ON `user_subscriptions` (`account_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_subscriptions_customer_unique` ON `user_subscriptions` (`stripe_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_subscriptions_subscription_unique` ON `user_subscriptions` (`stripe_subscription_id`);--> statement-breakpoint
CREATE INDEX `user_subscriptions_state_idx` ON `user_subscriptions` (`state`);