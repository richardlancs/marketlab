CREATE TABLE `price_snapshot` (
	`checksum` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`source` text NOT NULL,
	`simulated` integer NOT NULL,
	`as_of` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `backtest_run` ADD `result` text;--> statement-breakpoint
ALTER TABLE `backtest_run` ADD `snapshot_checksum` text;--> statement-breakpoint
ALTER TABLE `backtest_run` ADD `engine` text;--> statement-breakpoint
ALTER TABLE `backtest_run` ADD `engine_version` text;--> statement-breakpoint
ALTER TABLE `backtest_run` ADD `data_source` text;--> statement-breakpoint
ALTER TABLE `backtest_run` ADD `simulated` integer;--> statement-breakpoint
ALTER TABLE `backtest_run` ADD `dataset_version` text;