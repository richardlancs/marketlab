CREATE TABLE `badge` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`earned_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `scope`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `season` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	`announced_at` integer,
	`reminded_at` integer
);
--> statement-breakpoint
CREATE TABLE `season_entry` (
	`season_id` text NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`display_name` text NOT NULL,
	`name_key` text NOT NULL,
	`joined_at` integer NOT NULL,
	`start_value` real NOT NULL,
	`final_value` real,
	`final_rank` integer,
	PRIMARY KEY(`season_id`, `user_id`),
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_entry_account_id_unique` ON `season_entry` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `season_entry_name_idx` ON `season_entry` (`season_id`,`name_key`);--> statement-breakpoint
CREATE TABLE `season_standing` (
	`account_id` text NOT NULL,
	`time` integer NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`account_id`, `time`),
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `season_of` text REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `user_season_of_idx` ON `user` (`season_of`);