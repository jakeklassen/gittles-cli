import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';

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
