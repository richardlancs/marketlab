CREATE TABLE `portfolio_value` (
	`user_id` text NOT NULL,
	`time` integer NOT NULL,
	`value` real NOT NULL,
	`cash` real NOT NULL,
	PRIMARY KEY(`user_id`, `time`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
