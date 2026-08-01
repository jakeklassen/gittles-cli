import {spawnSync} from 'node:child_process';
import {CSI} from './ansi.js';

export type Size = {columns: number; rows: number};

/**
 * process.stdout.columns is SC2020-blocked, and SIGWINCH is not a supported process
 * event, so size comes from $COLUMNS/$LINES first and `stty size` second. Cached:
 * spawning stty per frame would be absurd.
 */
let cached: Size | undefined;

function fromStty(): Size | undefined {
	// stty needs a real tty on ITS stdin, so inherit ours rather than piping.
	const result = spawnSync('stty', ['size'], {
		encoding: 'utf8',
		stdio: ['inherit', 'pipe', 'ignore'],
	});

	if (result.status !== 0) {
		return undefined;
	}

	const parts = result.stdout.trim().split(' ');
	if (parts.length < 2) {
		return undefined;
	}

	const rows = Number(parts[0]);
	const columns = Number(parts[1]);
	if (rows <= 0 || columns <= 0) {
		return undefined;
	}

	return {columns, rows};
}

/**
 * XTWINOPS "report text area size in characters". The terminal answers on stdin with
 * ESC[8;<rows>;<cols>t. Since SIGWINCH is not a supported process event, asking on a
 * timer is how resizes get noticed — and unlike re-running `stty`, it forks nothing.
 */
export const SIZE_QUERY = `${CSI}18t`;

/** Parse an ESC[8;rows;cols t reply. The leading ESC is already stripped by decodeKeys. */
export function parseSizeReport(sequence: string): Size | undefined {
	if (sequence.slice(0, 3) !== '[8;') {
		return undefined;
	}

	if (sequence.slice(sequence.length - 1) !== 't') {
		return undefined;
	}

	const parts = sequence.slice(3, sequence.length - 1).split(';');
	if (parts.length < 2) {
		return undefined;
	}

	const rows = Number(parts[0]);
	const columns = Number(parts[1]);
	if (rows <= 0 || columns <= 0) {
		return undefined;
	}

	return {columns, rows};
}

export function setSize(next: Size): void {
	cached = next;
}

/**
 * Measure with `stty` for terminals that ignore the XTWINOPS query. Deliberately does
 * NOT touch the cache: the caller compares this against the cached size to decide
 * whether anything changed, and updating the cache first would hide every resize.
 */
export function measureNow(): Size | undefined {
	return fromStty();
}

export function size(): Size {
	if (cached !== undefined) {
		return cached;
	}

	const envColumns = process.env['COLUMNS'];
	const envRows = process.env['LINES'];
	if (envColumns !== undefined && envRows !== undefined) {
		const columns = Number(envColumns);
		const rows = Number(envRows);
		if (columns > 0 && rows > 0) {
			cached = {columns, rows};
			return cached;
		}
	}

	const measured = fromStty();
	cached = measured === undefined ? {columns: 80, rows: 24} : measured;
	return cached;
}

export type Key = {
	/** 'up' | 'down' | 'return' | 'escape' | 'backspace' | 'ctrl-c' | a literal char */
	name: string;
	/** The raw bytes, for printable input. */
	raw: string;
};

const FINAL_BYTE_MIN = 64; // '@'
const FINAL_BYTE_MAX = 126; // '~'

function namedSequence(sequence: string): string {
	// ESC[8;rows;cols t — the terminal answering SIZE_QUERY, not a keypress.
	if (sequence.slice(sequence.length - 1) === 't') return 'size-report';
	if (sequence === '[A') return 'up';
	if (sequence === '[B') return 'down';
	if (sequence === '[C') return 'right';
	if (sequence === '[D') return 'left';
	if (sequence === '[H' || sequence === '[1~') return 'home';
	if (sequence === '[F' || sequence === '[4~') return 'end';
	if (sequence === '[5~') return 'pageup';
	if (sequence === '[6~') return 'pagedown';
	if (sequence === '[3~') return 'delete';
	return 'unknown';
}

/**
 * A terminal read can carry several keypresses (and an arrow key is three bytes),
 * so decode the chunk into discrete keys instead of comparing the whole string.
 */
export function decodeKeys(chunk: string): Key[] {
	const keys: Key[] = [];
	let i = 0;

	while (i < chunk.length) {
		const ch = chunk[i];
		const code = chunk.charCodeAt(i);

		if (code === 27 && i + 1 < chunk.length && chunk[i + 1] === '[') {
			let end = i + 2;
			while (end < chunk.length) {
				const final = chunk.charCodeAt(end);
				if (final >= FINAL_BYTE_MIN && final <= FINAL_BYTE_MAX) {
					break;
				}

				end += 1;
			}

			const sequence = chunk.slice(i + 1, end + 1);
			keys.push({name: namedSequence(sequence), raw: sequence});
			i = end + 1;
			continue;
		}

		if (code === 27) {
			keys.push({name: 'escape', raw: ch});
		} else if (code === 3) {
			keys.push({name: 'ctrl-c', raw: ch});
		} else if (code === 13 || code === 10) {
			keys.push({name: 'return', raw: ch});
		} else if (code === 127 || code === 8) {
			keys.push({name: 'backspace', raw: ch});
		} else if (code === 9) {
			keys.push({name: 'tab', raw: ch});
		} else if (code < 32) {
			keys.push({name: 'control', raw: ch});
		} else {
			keys.push({name: ch, raw: ch});
		}

		i += 1;
	}

	return keys;
}

/** Open a URL in the user's browser — `open` the npm package, minus the package. */
export function openUrl(url: string): boolean {
	const platform = process.platform;
	const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open';
	const result = spawnSync(command, [url], {stdio: 'ignore'});
	return result.status === 0;
}
