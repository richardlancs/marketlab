CREATE TABLE `company_facts` (
	`symbol` text PRIMARY KEY NOT NULL,
	`data` text,
	`filed` text,
	`fetched_at` integer NOT NULL
);
