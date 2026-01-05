import {int, sqliteTable, text} from 'drizzle-orm/sqlite-core';

export const starsTable = sqliteTable('stars', {
	id: int().primaryKey(),
	name: text().notNull(),
	fullName: text().notNull(),
	description: text(),
	url: text().notNull(),
	homepage: text(),
	language: text(),
	stargazersCount: int().notNull().default(0),
	forksCount: int().notNull().default(0),
	openIssuesCount: int().notNull().default(0),
	pushedAt: text(),
	createdAt: text(),
	updatedAt: text(),
	starredAt: text(),
});
