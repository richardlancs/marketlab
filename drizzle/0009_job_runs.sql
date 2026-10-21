CREATE TABLE `job_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`ok` integer NOT NULL,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_run_name_idx` ON `job_run` (`name`,`started_at`);