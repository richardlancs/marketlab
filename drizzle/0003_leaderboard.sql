CREATE TABLE `leaderboard_entry` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`name_key` text NOT NULL,
	`joined_at` integer NOT NULL,
	`start_value` real NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leaderboard_entry_name_key_unique` ON `leaderboard_entry` (`name_key`);