import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {loadConfig, saveConfig} from './store.js';

export const VERSION = '0.3.1';

const DEFAULT_REPO = 'jakeklassen/gittles-cli';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Overridable so the updater can be exercised against a repo that has releases. */
function repo(): string {
	return process.env['GITTLES_UPDATE_REPO'] ?? DEFAULT_REPO;
}

export type Release = {
	version: string;
	assetName: string;
	assetUrl: string;
	checksumUrl: string;
};

type ApiAsset = {
	name: string;
	browser_download_url: string;
	size: number;
};

type ApiRelease = {
	tag_name: string;
	assets: ApiAsset[];
};

type Fetched = {
	status: number;
	location: string;
	body: Buffer;
};

/**
 * Binary-safe GET. Chunks are collected as Buffers and concatenated — decoding to a
 * string would corrupt an executable. Redirects are surfaced rather than followed,
 * because release assets always 302 to a different host.
 */
function get(url: string, accept: string): Promise<Fetched> {
	const withoutScheme = url.slice(8);
	const slash = withoutScheme.indexOf('/');
	const host = withoutScheme.slice(0, slash);
	const requestPath = withoutScheme.slice(slash);

	return new Promise<Fetched>((resolve, reject) => {
		const req = https.get(
			{
				hostname: host,
				path: requestPath,
				headers: {'user-agent': `gittles/${VERSION}`, accept: accept},
			},
			response => {
				const chunks: Buffer[] = [];
				response.on('data', (chunk: Buffer) => {
					chunks.push(chunk);
				});
				response.on('end', () => {
					const status = response.statusCode;
					const location = response.headers['location'];
					resolve({
						status: status === undefined ? 0 : status,
						location: typeof location === 'string' ? location : '',
						body: Buffer.concat(chunks),
					});
				});
			},
		);

		req.on('error', (error: Error) => {
			reject(error);
		});
	});
}

async function getFollowing(url: string, accept: string): Promise<Fetched> {
	let current = url;

	for (let hop = 0; hop < 5; hop += 1) {
		const response = await get(current, accept);
		if (response.location === '' || response.status < 300 || response.status > 399) {
			return response;
		}

		current = response.location;
	}

	throw new Error('too many redirects');
}

/** Compare vX.Y.Z strings. Returns true when `candidate` is newer than `current`. */
export function isNewer(candidate: string, current: string): boolean {
	const a = parseVersion(candidate);
	const b = parseVersion(current);

	for (let i = 0; i < 3; i += 1) {
		if (a[i] !== b[i]) {
			return a[i] > b[i];
		}
	}

	return false;
}

function parseVersion(version: string): number[] {
	// Release tags carry a 'v' prefix. Start at the first digit so the major number
	// is never lost to the prefix.
	let start = 0;
	while (start < version.length) {
		const code = version.charCodeAt(start);
		if (code >= 48 && code <= 57) {
			break;
		}

		start += 1;
	}

	const parts = version.slice(start).split('.');
	const out: number[] = [];

	for (let i = 0; i < 3; i += 1) {
		const value = i < parts.length ? Number(parts[i]) : 0;
		out.push(value >= 0 ? value : 0);
	}

	return out;
}

/**
 * The asset name this platform needs, matching what a release workflow would emit.
 * Overridable alongside GITTLES_UPDATE_REPO so the whole download → verify → swap
 * path can be exercised against somebody else's real release.
 */
function assetNameFor(): string {
	const override = process.env['GITTLES_UPDATE_ASSET'];
	if (override !== undefined) {
		return override;
	}

	const platform = process.platform;
	const arch = process.arch;
	const suffix = platform === 'win32' ? '.exe' : '';
	return `gittles-${platform}-${arch}${suffix}`;
}

export async function fetchLatestRelease(): Promise<Release> {
	const response = await getFollowing(
		`https://api.github.com/repos/${repo()}/releases/latest`,
		'application/vnd.github+json',
	);

	if (response.status !== 200) {
		throw new Error(`release lookup failed (HTTP ${response.status})`);
	}

	const release = JSON.parse(response.body.toString('utf8')) as ApiRelease;
	const wanted = assetNameFor();

	let assetUrl = '';
	let assetName = '';
	let checksumUrl = '';

	for (const asset of release.assets) {
		if (asset.name === wanted) {
			assetUrl = asset.browser_download_url;
			assetName = asset.name;
		}

		if (asset.name.includes('checksums')) {
			checksumUrl = asset.browser_download_url;
		}
	}

	return {
		version: release.tag_name,
		assetName: assetName,
		assetUrl: assetUrl,
		checksumUrl: checksumUrl,
	};
}

/**
 * The cached answer to "is there anything newer", refreshed at most daily. A network
 * round-trip on every launch would cost more than the entire rest of the program.
 *
 * The cache records which repo it came from and is a miss when that no longer matches:
 * a version cached from a different repo says nothing about this one, and a day of
 * showing somebody else's release as available is a day of lying.
 *
 * Nothing is written at all while GITTLES_UPDATE_REPO is set. That override exists for
 * testing, and a test must not leave state behind that outlives it.
 */
export function isCacheUsable(
	cachedRepo: string,
	currentRepo: string,
	lastCheck: string,
	now: number,
): boolean {
	if (cachedRepo !== currentRepo || lastCheck === '') {
		return false;
	}

	const age = now - Number(lastCheck);
	return age >= 0 && age < CHECK_INTERVAL_MS;
}

export async function checkForUpdate(force: boolean): Promise<string> {
	const config = loadConfig();
	const overridden = process.env['GITTLES_UPDATE_REPO'] !== undefined;
	const cached = config.latestVersion ?? '';

	const usable = isCacheUsable(
		config.latestRepo ?? '',
		repo(),
		config.lastUpdateCheck ?? '',
		Date.now(),
	);

	if (!force && !overridden && usable) {
		return isNewer(cached, VERSION) ? cached : '';
	}

	try {
		const release = await fetchLatestRelease();

		if (!overridden) {
			saveConfig({
				token: config.token,
				username: config.username,
				lastSyncedAt: config.lastSyncedAt,
				lastUpdateCheck: `${Date.now()}`,
				latestVersion: release.version,
				latestRepo: repo(),
				skippedVersion: config.skippedVersion ?? '',
			});
		}

		return isNewer(release.version, VERSION) ? release.version : '';
	} catch {
		// An update check must never be the reason the CLI fails.
		return '';
	}
}

export function skipVersion(version: string): void {
	const config = loadConfig();
	saveConfig({
		token: config.token,
		username: config.username,
		lastSyncedAt: config.lastSyncedAt,
		lastUpdateCheck: config.lastUpdateCheck ?? '',
		latestVersion: config.latestVersion ?? '',
		latestRepo: config.latestRepo ?? '',
		skippedVersion: version,
	});
}

export function wasSkipped(version: string): boolean {
	return (loadConfig().skippedVersion ?? '') === version;
}

function sha256(payload: Buffer): string {
	return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Signature verification, delegated.
 *
 * scriptc's static crypto surface is "hashing, randomness, and the introspection
 * statics" — no bignum, no EdDSA, no KeyObject — so this binary cannot verify a
 * signature itself. What it can do is ask the GitHub CLI to check the release's
 * sigstore build-provenance attestation, which proves the asset was built by the
 * repo's workflow rather than uploaded by whoever held a token.
 *
 * Opt-in, because attestations do not exist for every release: GitHub does not offer
 * them to user-owned private repos, and enforcing by default would refuse every
 * update rather than verify anything. Matches install.sh. When it is on and gh says
 * no, this throws — a check that degrades to a warning is not a check.
 *
 * Returns 'verified', 'unavailable' (not requested), or throws.
 */
function verifyAttestation(file: string): string {
	if (process.env['GITTLES_VERIFY_ATTESTATION'] !== '1') {
		return 'unavailable';
	}

	const available = spawnSync('gh', ['--version'], {stdio: 'ignore'});
	if (available.status !== 0) {
		throw new Error('GITTLES_VERIFY_ATTESTATION=1 but the gh CLI is not installed');
	}

	const result = spawnSync('gh', ['attestation', 'verify', file, '--repo', repo()], {
		stdio: 'ignore',
	});

	if (result.status !== 0) {
		throw new Error(`build provenance could not be verified for ${repo()} — refusing to install`);
	}

	return 'verified';
}

/**
 * Move `from` over `to`. fs.renameSync has no scriptc lowering, so this shells out —
 * and the two platforms disagree about replacing a running executable. POSIX lets you
 * rename over it (the running process keeps its inode); Windows does not, but it does
 * allow renaming the running image aside first.
 */
function replaceBinary(staged: string, target: string, version: string): void {
	if (process.platform === 'win32') {
		const parked = `${target}.old-${version}`;
		const parkResult = spawnSync('cmd', ['/c', 'move', '/y', target, parked], {
			stdio: 'ignore',
		});
		if (parkResult.status !== 0) {
			throw new Error('could not move the running binary aside');
		}

		const installResult = spawnSync('cmd', ['/c', 'move', '/y', staged, target], {
			stdio: 'ignore',
		});
		if (installResult.status !== 0) {
			// Put the original back rather than leaving no binary at all.
			spawnSync('cmd', ['/c', 'move', '/y', parked, target], {stdio: 'ignore'});
			throw new Error('could not install the new binary');
		}

		return;
	}

	const moved = spawnSync('mv', ['-f', staged, target], {stdio: 'ignore'});
	if (moved.status !== 0) {
		throw new Error('could not replace the running binary');
	}
}

/**
 * Windows cannot delete the image it is running from, so an update leaves the previous
 * binary parked beside it. Sweep those on the next start, best effort.
 */
export function cleanupAfterUpdate(): void {
	if (process.platform !== 'win32') {
		return;
	}

	try {
		const target = process.execPath;
		const directory = path.dirname(target);
		const name = path.basename(target);

		for (const entry of fs.readdirSync(directory)) {
			if (entry.slice(0, name.length + 5) === `${name}.old-`) {
				try {
					fs.unlinkSync(path.join(directory, entry));
				} catch {
					// Still running, or not ours to delete. Try again next time.
				}
			}
		}
	} catch {
		// Never let cleanup break startup.
	}
}

/** Find `name`'s digest in a `sha256sum`-style checksums file. */
function digestFor(checksums: string, name: string): string {
	for (const line of checksums.split('\n')) {
		const parts = line.trim().split(' ');
		if (parts.length < 2) {
			continue;
		}

		const file = parts[parts.length - 1];
		if (file === name || file === `*${name}`) {
			return parts[0];
		}
	}

	return '';
}

export type ProgressCallback = (message: string) => void;

/**
 * Download, verify, and swap the running binary.
 *
 * Writing over a running executable fails with ETXTBSY, so the new file is written
 * alongside the target and moved into place. `fs.renameSync` has no scriptc lowering,
 * hence `mv`; the running process keeps its old inode and is unaffected either way.
 */
export async function installUpdate(
	release: Release,
	onProgress: ProgressCallback,
): Promise<string> {
	if (release.assetUrl === '') {
		throw new Error(`no ${assetNameFor()} in release ${release.version}`);
	}

	const target = process.execPath;
	const directory = path.dirname(target);

	// Fail before downloading anything if the install location is not writable.
	try {
		fs.accessSync(directory, fs.constants.W_OK);
	} catch {
		throw new Error(`${directory} is not writable — update manually, or install to ~/.local/bin`);
	}

	onProgress(`downloading ${release.assetName}…`);
	const asset = await getFollowing(release.assetUrl, '*/*');
	if (asset.status !== 200) {
		throw new Error(`download failed (HTTP ${asset.status})`);
	}

	if (release.checksumUrl === '') {
		throw new Error('release has no checksums file — refusing to install');
	}

	onProgress('verifying checksum…');
	const checksums = await getFollowing(release.checksumUrl, '*/*');
	const expected = digestFor(checksums.body.toString('utf8'), release.assetName);
	if (expected === '') {
		throw new Error(`no checksum published for ${release.assetName}`);
	}

	const actual = sha256(asset.body);
	if (actual !== expected) {
		throw new Error(`checksum mismatch: expected ${expected.slice(0, 16)}…`);
	}

	// Staged in the target directory so the move is a rename within one filesystem.
	const staged = path.join(directory, `.gittles-${release.version}.new`);
	fs.writeFileSync(staged, asset.body);
	fs.chmodSync(staged, 493); // 0o755

	onProgress('verifying build provenance…');
	let provenance = 'unavailable';
	try {
		provenance = verifyAttestation(staged);
	} catch (error: unknown) {
		fs.unlinkSync(staged);
		throw error;
	}

	onProgress('installing…');
	try {
		replaceBinary(staged, target, release.version);
	} catch (error: unknown) {
		fs.unlinkSync(staged);
		throw error;
	}

	return provenance === 'verified' ? release.version : `${release.version} (checksum verified)`;
}
