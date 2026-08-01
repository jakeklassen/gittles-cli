import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {Star} from './github.js';

const dir = path.join(os.homedir(), '.config', 'gittles');
const starsFile = path.join(dir, 'stars.json');
const configFile = path.join(dir, 'config.json');

/**
 * conf, minus conf. The three original fields are always written, so the checked cast
 * on read never meets a missing one. Fields added later are optional on purpose: a
 * config written by an older build has no `lastUpdateCheck`, and a required field
 * would make the cast throw and log the user out.
 */
export type Config = {
	token: string;
	username: string;
	lastSyncedAt: string;
	lastUpdateCheck?: string;
	latestVersion?: string;
	skippedVersion?: string;
};

const EMPTY: Config = {token: '', username: '', lastSyncedAt: ''};

function ensureDir(): void {
	fs.mkdirSync(dir, {recursive: true});
}

export function loadConfig(): Config {
	if (!fs.existsSync(configFile)) {
		return EMPTY;
	}

	try {
		return JSON.parse(fs.readFileSync(configFile, 'utf8')) as Config;
	} catch {
		// A config the current shape cannot describe. Better to re-authenticate than
		// to crash on every launch.
		return EMPTY;
	}
}

export function saveConfig(config: Config): void {
	ensureDir();
	fs.writeFileSync(configFile, JSON.stringify(config));
}

export function clearAuth(): void {
	const config = loadConfig();
	saveConfig({
		token: '',
		username: '',
		lastSyncedAt: config.lastSyncedAt,
		lastUpdateCheck: config.lastUpdateCheck,
		latestVersion: config.latestVersion,
		skippedVersion: config.skippedVersion,
	});
}

export function isAuthenticated(): boolean {
	return loadConfig().token !== '';
}

/**
 * The checked cast throws when the stored shape does not match Star — which is what
 * a schema change looks like. Treat that as "no cache" rather than a crash: the
 * caller re-syncs. (Under Node this would silently hand back malformed objects.)
 */
export function loadStars(): Star[] {
	if (!fs.existsSync(starsFile)) {
		return [];
	}

	try {
		return JSON.parse(fs.readFileSync(starsFile, 'utf8')) as Star[];
	} catch {
		return [];
	}
}

export function saveStars(stars: Star[]): void {
	ensureDir();
	fs.writeFileSync(starsFile, JSON.stringify(stars));
}

export function markSynced(): void {
	const config = loadConfig();
	saveConfig({
		token: config.token,
		username: config.username,
		lastSyncedAt: new Date(Date.now()).toISOString(),
		lastUpdateCheck: config.lastUpdateCheck,
		latestVersion: config.latestVersion,
		skippedVersion: config.skippedVersion,
	});
}
