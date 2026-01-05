import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {migrate} from 'drizzle-orm/libsql/migrator';

const configDir = path.join(os.homedir(), '.config', 'gittles');
const defaultDbPath = path.join(configDir, 'gittles.db');

// Ensure config directory exists
if (!process.env['DB_FILE_NAME']) {
	fs.mkdirSync(configDir, {recursive: true});
}

const dbPath = process.env['DB_FILE_NAME'] ?? `file:${defaultDbPath}`;

const client = createClient({
	url: dbPath,
});

export const db = drizzle(client, {logger: false});

// Run migrations on startup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From dist/db/index.js, go up two levels to reach project root where drizzle/ folder is
const migrationsFolder = path.join(__dirname, '..', '..', 'drizzle');

await migrate(db, {migrationsFolder});
