CREATE TABLE `account_event` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`symbol` text NOT NULL,
	`time` integer NOT NULL,
	`shares` integer NOT NULL,
	`value` real NOT NULL,
	`cash` real NOT NULL,
	`shares_after` integer,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_event_user_time_idx` ON `account_event` (`user_id`,`time`);--> statement-breakpoint
CREATE TABLE `pending_order` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`type` text NOT NULL,
	`shares` integer NOT NULL,
	`price` real NOT NULL,
	`duration` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`closed_at` integer,
	`fill_price` real,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pending_order_user_idx` ON `pending_order` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `price_alert` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`price` real NOT NULL,
	`created_at` integer NOT NULL,
	`triggered_at` integer,
	`trigger_price` real,
	`seen` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_alert_user_idx` ON `price_alert` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `portfolio` ADD `processed_through` integer;