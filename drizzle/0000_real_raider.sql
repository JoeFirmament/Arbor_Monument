CREATE TABLE `location_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`verifier_key` text NOT NULL,
	`verifier_name` text NOT NULL,
	`on_site` integer DEFAULT false NOT NULL,
	`gps_accuracy_m` real,
	`distance_from_proposal_m` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `location_proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_location_confirmations_proposal_verifier` ON `location_confirmations` (`proposal_id`,`verifier_key`);--> statement-breakpoint
CREATE INDEX `idx_location_confirmations_proposal` ON `location_confirmations` (`proposal_id`);--> statement-breakpoint
CREATE TABLE `location_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`tree_id` text NOT NULL,
	`contributor_key` text NOT NULL,
	`contributor_name` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`coordinate_system` text DEFAULT 'WGS84' NOT NULL,
	`accuracy_m` real,
	`capture_method` text NOT NULL,
	`location_description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirmation_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_location_proposals_tree_status` ON `location_proposals` (`tree_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_location_proposals_contributor_created` ON `location_proposals` (`contributor_key`,`created_at`);