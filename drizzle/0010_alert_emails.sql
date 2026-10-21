CREATE TABLE `email_preference` (
	`user_id` text PRIMARY KEY NOT NULL,
	`alert_emails` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `price_alert` ADD `emailed_at` integer;