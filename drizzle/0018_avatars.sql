CREATE TABLE `avatar` (
	`user_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`data` blob NOT NULL,
	`version` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Google sign-in used to store the Google account's photo address; MarketLab never shows it, so it isn't kept (lib/auth.ts).
UPDATE `user` SET `image` = NULL WHERE `image` IS NOT NULL;
