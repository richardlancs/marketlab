CREATE TABLE `analytics_result` (
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`source` text NOT NULL,
	`version` text NOT NULL,
	`input_checksum` text NOT NULL,
	`as_of` integer NOT NULL,
	`result` text NOT NULL,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`kind`, `subject`, `source`)
);
--> statement-breakpoint
CREATE TABLE `daily_bar` (
	`source` text NOT NULL,
	`symbol` text NOT NULL,
	`time` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`adj_close` real NOT NULL,
	`volume` real,
	PRIMARY KEY(`source`, `symbol`, `time`)
);
--> statement-breakpoint
CREATE TABLE `price_series` (
	`source` text NOT NULL,
	`symbol` text NOT NULL,
	`checksum` text NOT NULL,
	`first_time` integer NOT NULL,
	`last_time` integer NOT NULL,
	`bars` integer NOT NULL,
	`market_cap` real,
	`pe_ratio` real,
	`dividend_yield` real,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`source`, `symbol`)
);
--> statement-breakpoint
ALTER TABLE `price_alert` ADD `condition` text;