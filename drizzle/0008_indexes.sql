CREATE INDEX `backtest_run_snapshot_idx` ON `backtest_run` (`snapshot_checksum`);--> statement-breakpoint
CREATE INDEX `portfolio_processed_through_idx` ON `portfolio` (`processed_through`);