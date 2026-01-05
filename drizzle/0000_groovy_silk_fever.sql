CREATE TABLE `stars` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`fullName` text NOT NULL,
	`description` text,
	`url` text NOT NULL,
	`homepage` text,
	`language` text,
	`stargazersCount` integer DEFAULT 0 NOT NULL,
	`forksCount` integer DEFAULT 0 NOT NULL,
	`openIssuesCount` integer DEFAULT 0 NOT NULL,
	`pushedAt` text,
	`createdAt` text,
	`updatedAt` text,
	`starredAt` text
);
