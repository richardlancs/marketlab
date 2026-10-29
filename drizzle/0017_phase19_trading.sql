CREATE TABLE `option_position` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`symbol` text NOT NULL,
	`kind` text NOT NULL,
	`strike` real NOT NULL,
	`expiry` integer NOT NULL,
	`contracts` integer NOT NULL,
	`average_premium` real NOT NULL,
	`mark` real,
	`marked_at` integer,
	`delta` real,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `pending_order` ADD `short` integer;--> statement-breakpoint
ALTER TABLE `pending_order` ADD `trail_kind` text;--> statement-breakpoint
ALTER TABLE `pending_order` ADD `trail_value` real;--> statement-breakpoint
ALTER TABLE `pending_order` ADD `extreme` real;--> statement-breakpoint
ALTER TABLE `pending_order` ADD `bracket_stop` real;--> statement-breakpoint
ALTER TABLE `pending_order` ADD `bracket_target` real;--> statement-breakpoint
ALTER TABLE `pending_order` ADD `oco_group` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `option_kind` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `strike` real;--> statement-breakpoint
ALTER TABLE `trade` ADD `expiry` integer;