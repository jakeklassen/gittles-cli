const ESC = String.fromCharCode(27);

export const CSI = `${ESC}[`;

/**
 * supports-color in ~25 lines. No npm package can be used here without pulling in
 * the 620KB dynamic engine, and the detection is mostly env-var reading anyway.
 * 0 = no color, 1 = basic 16, 2 = 256, 3 = truecolor.
 */
function detectColorLevel(): number {
	if (process.env['NO_COLOR'] !== undefined) {
		return 0;
	}

	const force = process.env['FORCE_COLOR'];
	if (force !== undefined) {
		if (force === '0' || force === 'false') {
			return 0;
		}

		if (force === '2') {
			return 2;
		}

		if (force === '3') {
			return 3;
		}

		return 1;
	}

	if (process.stdout.isTTY !== true) {
		return 0;
	}

	const term = process.env['TERM'] ?? '';
	if (term === 'dumb' || term === '') {
		return 0;
	}

	const colorterm = process.env['COLORTERM'] ?? '';
	if (colorterm === 'truecolor' || colorterm === '24bit') {
		return 3;
	}

	if (term.includes('256')) {
		return 2;
	}

	return 1;
}

export const colorLevel = detectColorLevel();

/** Apply a full SGR code string ('1;36'). Codes are combined here rather than by
 * nesting calls, because a nested reset would cancel the outer style. */
export function style(text: string, codes: string): string {
	return colorLevel === 0 ? text : `${CSI}${codes}m${text}${CSI}0m`;
}

/** A 256-color foreground, degrading to the nearest basic color. */
export function fg256(text: string, code: number, fallback: string): string {
	if (colorLevel === 0) {
		return text;
	}

	return colorLevel >= 2 ? style(text, `38;5;${code}`) : style(text, fallback);
}

export const bold = (text: string): string => style(text, '1');
export const dim = (text: string): string => style(text, '2');
export const italic = (text: string): string => style(text, '3');
export const underline = (text: string): string => style(text, '4');
export const inverse = (text: string): string => style(text, '7');
export const strike = (text: string): string => style(text, '9');

export const red = (text: string): string => style(text, '31');
export const green = (text: string): string => style(text, '32');
export const yellow = (text: string): string => style(text, '33');
export const blue = (text: string): string => style(text, '34');
export const magenta = (text: string): string => style(text, '35');
export const cyan = (text: string): string => style(text, '36');

export const hideCursor = `${CSI}?25l`;
export const showCursor = `${CSI}?25h`;
export const altScreen = `${CSI}?1049h`;
export const mainScreen = `${CSI}?1049l`;
export const home = `${CSI}H`;
export const disableWrap = `${CSI}?7l`;
export const enableWrap = `${CSI}?7h`;

/**
 * DEC mode 2026, "synchronized output": hold presentation until the frame is complete.
 * Without it a terminal can present a half-written frame — rows erased but not yet
 * redrawn — which reads as flicker. Supported by Windows Terminal, kitty, iTerm2,
 * WezTerm; terminals that don't know it ignore the sequence.
 */
export const beginSync = `${CSI}?2026h`;
export const endSync = `${CSI}?2026l`;
export const clearLine = `${CSI}2K`;
export const clearBelow = `${CSI}J`;
export const clearScreen = `${CSI}2J${CSI}H`;

/** Printable width, ignoring SGR sequences. Combining marks and wide CJK are not
 * accounted for — a known limitation of not shipping string-width. */
export function visibleWidth(text: string): number {
	let width = 0;
	let inEscape = false;
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (ch === ESC) {
			inEscape = true;
			continue;
		}

		if (inEscape) {
			if (ch === 'm') {
				inEscape = false;
			}

			continue;
		}

		width += 1;
	}

	return width;
}

export function truncate(text: string, width: number): string {
	if (width <= 0) {
		return '';
	}

	return text.length <= width ? text : `${text.slice(0, width - 1)}…`;
}

export function padEnd(text: string, width: number): string {
	const current = visibleWidth(text);
	if (current >= width) {
		return text;
	}

	let padding = '';
	for (let i = current; i < width; i += 1) {
		padding += ' ';
	}

	return `${text}${padding}`;
}

export function padStart(text: string, width: number): string {
	const current = visibleWidth(text);
	if (current >= width) {
		return text;
	}

	let padding = '';
	for (let i = current; i < width; i += 1) {
		padding += ' ';
	}

	return `${padding}${text}`;
}

/**
 * Cut a styled string to a printable width, keeping SGR sequences intact. A single
 * line that overflows the terminal wraps and shifts everything below it, so every
 * emitted line goes through this.
 */
export function clampToWidth(text: string, width: number): string {
	let out = '';
	let printable = 0;
	let i = 0;

	while (i < text.length) {
		const ch = text[i];
		if (ch === ESC) {
			let end = i;
			while (end < text.length && text[end] !== 'm') {
				end += 1;
			}

			out += text.slice(i, end + 1);
			i = end + 1;
			continue;
		}

		if (printable >= width) {
			// Keep any trailing reset so the style does not leak into the next line.
			return `${out}${CSI}0m`;
		}

		out += ch;
		printable += 1;
		i += 1;
	}

	return out;
}

export function repeat(text: string, count: number): string {
	let out = '';
	for (let i = 0; i < count; i += 1) {
		out += text;
	}

	return out;
}

/** Intl.NumberFormat has no lowering, so group digits by hand. */
export function groupDigits(n: number): string {
	const s = `${n}`;
	let out = '';
	let count = 0;
	for (let i = s.length - 1; i >= 0; i -= 1) {
		out = s[i] + out;
		count += 1;
		if (count % 3 === 0 && i > 0) {
			out = `,${out}`;
		}
	}

	return out;
}

function parseDigits(s: string, start: number, end: number): number {
	let n = 0;
	for (let i = start; i < end; i += 1) {
		n = n * 10 + (s.charCodeAt(i) - 48);
	}

	return n;
}

/** Days from 1970-01-01 (Howard Hinnant's days_from_civil). */
function daysFromCivil(y: number, m: number, d: number): number {
	const year = m <= 2 ? y - 1 : y;
	const era = Math.floor(year / 400);
	const yoe = year - era * 400;
	const mp = (m + 9) % 12;
	const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146_097 + doe - 719_468;
}

/** new Date(string) has no lowering, so parse ISO-8601 by hand. */
export function isoToMs(iso: string): number {
	if (iso.length < 19) {
		return 0;
	}

	const days = daysFromCivil(
		parseDigits(iso, 0, 4),
		parseDigits(iso, 5, 7),
		parseDigits(iso, 8, 10),
	);
	const hour = parseDigits(iso, 11, 13);
	const minute = parseDigits(iso, 14, 16);
	const second = parseDigits(iso, 17, 19);
	return ((days * 24 + hour) * 60 + minute) * 60_000 + second * 1000;
}

export function relativeTime(iso: string): string {
	if (iso === '') {
		return 'never';
	}

	const seconds = Math.floor((Date.now() - isoToMs(iso)) / 1000);
	if (seconds < 60) {
		return 'just now';
	}

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}

	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}

	const days = Math.floor(hours / 24);
	if (days < 30) {
		return `${days}d ago`;
	}

	const months = Math.floor(days / 30);
	if (months < 12) {
		return `${months}mo ago`;
	}

	return `${Math.floor(months / 12)}y ago`;
}
