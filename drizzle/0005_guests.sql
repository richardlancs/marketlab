ALTER TABLE `user` ADD `is_guest` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `user_is_guest_idx` ON `user` (`is_guest`,`updated_at`);