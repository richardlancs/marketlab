CREATE TABLE `learner` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learner_user_id_unique` ON `learner` (`user_id`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`learner_id` text NOT NULL,
	`term` text NOT NULL,
	`answers` text NOT NULL,
	`total` integer NOT NULL,
	`best_score` integer,
	`passed_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`learner_id`, `term`),
	FOREIGN KEY (`learner_id`) REFERENCES `learner`(`id`) ON UPDATE no action ON DELETE cascade
);
