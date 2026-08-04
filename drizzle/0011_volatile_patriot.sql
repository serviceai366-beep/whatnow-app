CREATE TABLE `user_favorite_modes` (
	`user_id` text PRIMARY KEY NOT NULL,
	`favorite_mode` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "user_favorite_modes_value_valid" CHECK("user_favorite_modes"."favorite_mode" is null or "user_favorite_modes"."favorite_mode" in ('understand', 'create', 'translate'))
);
