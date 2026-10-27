ALTER TABLE `pending_order` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `pending_order` ADD `trade_note` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `note` text;