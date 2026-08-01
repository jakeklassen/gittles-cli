import type {Star} from './github.js';
import {unstar} from './github.js';
import {loadConfig, saveStars} from './store.js';
import {
	checkForUpdate,
	fetchLatestRelease,
	installUpdate,
	skipVersion,
	wasSkipped,
} from './update.js';
import {
	decodeKeys,
	measureNow,
	openUrl,
	parseSizeReport,
	setSize,
	size,
	SIZE_QUERY,
} from './terminal.js';
import type {Key, Size} from './terminal.js';
import {
	altScreen,
	beginSync,
	bold,
	CSI,
	clampToWidth,
	clearBelow,
	clearLine,
	clearScreen,
	disableWrap,
	enableWrap,
	endSync,
	cyan,
	dim,
	fg256,
	green,
	groupDigits,
	hideCursor,
	home,
	inverse,
	mainScreen,
	padEnd,
	padStart,
	red,
	relativeTime,
	repeat,
	showCursor,
	strike,
	style,
	truncate,
	yellow,
} from './ansi.js';

/** GitHub's language colors, approximated in the 256-color cube. */
const LANGUAGE_COLORS = new Map<string, number>([
	['TypeScript', 75],
	['JavaScript', 221],
	['Rust', 209],
	['Go', 80],
	['Python', 68],
	['Ruby', 160],
	['C', 145],
	['C++', 204],
	['C#', 35],
	['Java', 172],
	['Zig', 214],
	['Shell', 113],
	['HTML', 202],
	['CSS', 99],
	['Svelte', 202],
	['Vue', 78],
	['Elixir', 97],
	['Haskell', 98],
	['Lua', 25],
	['Nix', 111],
	['Swift', 209],
	['Kotlin', 141],
	['Dart', 44],
	['PHP', 104],
]);

function languageLabel(language: string): string {
	if (language === '') {
		return '';
	}

	const color = LANGUAGE_COLORS.get(language);
	return color === undefined ? dim(language) : fg256(language, color, '34');
}

type Mode = 'list' | 'search' | 'help' | 'busy';

type State = {
	all: Star[];
	rows: Star[];
	selected: number;
	offset: number;
	query: string;
	mode: Mode;
	marked: number[];
	status: string;
	/** Whether the terminal answers SIZE_QUERY, which decides how resizes are polled. */
	sizeReportSeen: boolean;
	/** Newer version available, or '' — filled in asynchronously after the first paint. */
	updateAvailable: string;
};

function matches(star: Star, query: string): boolean {
	const q = query.toLowerCase();
	return (
		star.fullName.toLowerCase().includes(q) ||
		star.description.toLowerCase().includes(q) ||
		star.language.toLowerCase().includes(q)
	);
}

function applyFilter(state: State): void {
	if (state.query === '') {
		state.rows = state.all;
		return;
	}

	const out: Star[] = [];
	for (const star of state.all) {
		if (matches(star, state.query)) {
			out.push(star);
		}
	}

	state.rows = out;
}

// title + meta + rule + search + blank + rule + position + hints
const CHROME_LINES = 8;

/**
 * Lines available to the list area. The frame is deliberately one line shorter than
 * the terminal: emitting exactly as many lines as there are rows leaves the cursor on
 * the last line with nowhere to go, and the terminal scrolls — which reads as the
 * whole UI juddering as you move.
 */
function visibleCount(): number {
	return Math.max(3, size().rows - CHROME_LINES - 1);
}

/**
 * How many repos fit. One line of the list area is always reserved for the selected
 * repo's description, whether or not it has one, so inserting it never changes the
 * frame height.
 */
function rowWindow(): number {
	return Math.max(2, visibleCount() - 1);
}

function clampScroll(state: State): void {
	const count = rowWindow();
	if (state.selected < state.offset) {
		state.offset = state.selected;
	}

	if (state.selected >= state.offset + count) {
		state.offset = state.selected - count + 1;
	}

	const maxOffset = Math.max(0, state.rows.length - count);
	if (state.offset > maxOffset) {
		state.offset = maxOffset;
	}

	if (state.offset < 0) {
		state.offset = 0;
	}
}

function headerLines(state: State, width: number): string[] {
	const config = loadConfig();
	const account = config.username === '' ? 'not signed in' : config.username;

	return [
		`${bold(cyan('★ GITTLES'))}  ${dim('│')}  ${green(account)}`,
		dim(
			`${groupDigits(state.all.length)} stars · synced ${relativeTime(
				config.lastSyncedAt,
			)} · ${groupDigits(state.rows.length)} shown`,
		),
		dim(repeat('─', width)),
	];
}

function searchLine(state: State): string {
	if (state.mode === 'search') {
		return `${cyan('/')}${state.query}${inverse(' ')}`;
	}

	if (state.query === '') {
		return dim('/ to search');
	}

	return `${dim('/')}${state.query}  ${dim('(x to clear)')}`;
}

function rowLine(
	state: State,
	star: Star,
	isSelected: boolean,
	width: number,
): string {
	const isMarked = state.marked.includes(star.id);
	const nameWidth = Math.max(20, width - 40);

	const name = padEnd(truncate(star.fullName, nameWidth), nameWidth);
	const nameCell = isMarked
		? red(strike(name))
		: isSelected
			? bold(cyan(name))
			: name;

	// padEnd measures printable width, so the SGR codes in the label don't skew it.
	const languageCell = padEnd(languageLabel(star.language), 12);

	const line = `${isSelected ? '❯' : ' '} ${isMarked ? '✗' : ' '} ${nameCell}  ${yellow(
		padStart(`★ ${groupDigits(star.stargazersCount)}`, 9),
	)}  ${dim(padStart(relativeTime(star.pushedAt), 9))}  ${languageCell}`;

	if (!isSelected) {
		return line;
	}

	// Every inner style ends in a reset, which would also drop the row background.
	// Re-open the background after each one so the highlight survives the whole row.
	const highlight = `${CSI}48;5;236m`;
	return `${highlight}${line.split(`${CSI}0m`).join(`${CSI}0m${highlight}`)}${CSI}0m`;
}

function footerLines(state: State, width: number): string[] {
	const position =
		state.rows.length === 0
			? '0/0'
			: `${state.selected + 1}/${state.rows.length}`;

	const pending =
		state.marked.length === 0
			? ''
			: `  ${red(`${state.marked.length} marked`)} ${dim('· c to unstar')}`;

	const hints =
		state.mode === 'search'
			? dim('enter/esc done · ↑↓ move')
			: state.updateAvailable === ''
				? dim(
						'↑↓/jk move · / search · o open · d mark · c commit · ? help · q quit',
					)
				: `${green(`▲ ${state.updateAvailable} available`)} ${dim(
						'· U to update · S to skip',
					)}`;

	const status = state.status === '' ? '' : `  ${state.status}`;

	return [
		dim(repeat('─', width)),
		`${dim(position)}${pending}${status}`,
		hints,
	];
}

function helpLines(): string[] {
	return [
		bold('  Keys'),
		'',
		`  ${cyan('↑ ↓ j k')}      move`,
		`  ${cyan('pgup pgdn')}    page`,
		`  ${cyan('g G')}          top / bottom`,
		`  ${cyan('/')}            search (esc or enter to leave)`,
		`  ${cyan('x')}            clear the search`,
		`  ${cyan('o')}            open the selected repo in your browser`,
		`  ${cyan('d')}            mark / unmark for unstarring`,
		`  ${cyan('u')}            unmark everything`,
		`  ${cyan('c')}            commit — unstar everything marked`,
		`  ${cyan('?')}            this help`,
		`  ${cyan('q')}            quit`,
		'',
		dim('  press any key to go back'),
	];
}

function render(state: State): string {
	const width = size().columns;
	const lines: string[] = [];

	if (state.mode === 'help') {
		// Same height rule as the list: never emit more lines than the screen holds.
		for (const line of helpLines().slice(0, Math.max(1, size().rows - 1))) {
			lines.push(line);
		}

		return lines.join('\r\n');
	}

	for (const line of headerLines(state, width)) {
		lines.push(line);
	}

	lines.push(searchLine(state));
	lines.push('');

	const count = visibleCount();
	const end = Math.min(state.offset + rowWindow(), state.rows.length);

	// The list area is always exactly `count` lines — including the empty-state
	// message, which used to add one and shift everything below it.
	const listLines: string[] = [];

	if (state.rows.length === 0) {
		listLines.push(
			state.all.length === 0
				? dim('  no stars stored yet — run `gittles sync`')
				: dim('  nothing matches that search'),
		);
	}

	for (let i = state.offset; i < end; i += 1) {
		const isSelected = i === state.selected;
		listLines.push(rowLine(state, state.rows[i], isSelected, width));

		// The description belongs to the row, directly beneath it and indented to the
		// name column. The line is emitted even when empty: the height is reserved
		// either way, so moving the selection never reflows the list.
		if (isSelected) {
			const description = state.rows[i].description;
			listLines.push(
				description === ''
					? ''
					: dim(`    ${truncate(description, Math.max(10, width - 6))}`),
			);
		}
	}

	while (listLines.length < count) {
		listLines.push('');
	}

	for (const line of listLines.slice(0, count)) {
		lines.push(line);
	}

	for (const line of footerLines(state, width)) {
		lines.push(line);
	}

	return lines.join('\r\n');
}

/** The last painted frame, so redraws only touch lines that actually changed. */
let previousFrame: string[] = [];

/**
 * Repaint. Every line is clamped to the terminal width and there is NO trailing
 * newline: either one would wrap or scroll the screen and make the UI judder.
 *
 * `full` forces every line to be rewritten (first paint, or after a resize); otherwise
 * only changed lines are addressed and rewritten. A keypress changes about four lines
 * out of thirty, so this is ~10x less output and a much smaller window for tearing.
 */
function draw(state: State, full: boolean): void {
	const width = size().columns;
	const rendered = render(state).split('\r\n');
	const lines: string[] = [];

	for (const line of rendered) {
		lines.push(clampToWidth(line, width));
	}

	let out = beginSync;

	if (full || previousFrame.length !== lines.length) {
		const painted: string[] = [];
		for (const line of lines) {
			painted.push(`${clearLine}${line}`);
		}

		out += `${home}${painted.join('\r\n')}${clearBelow}`;
	} else {
		for (let i = 0; i < lines.length; i += 1) {
			if (lines[i] !== previousFrame[i]) {
				out += `${CSI}${i + 1};1H${clearLine}${lines[i]}`;
			}
		}
	}

	previousFrame = lines;
	process.stdout.write(`${out}${endSync}`);
}

function quit(): void {
	process.stdout.write(`${enableWrap}${showCursor}${mainScreen}`);
	process.exit(0);
}

/** Adopt a new terminal size: re-clamp, wipe the old geometry, repaint. */
function resize(state: State, next: Size): void {
	const current = size();
	if (next.columns === current.columns && next.rows === current.rows) {
		return;
	}

	setSize(next);
	clampScroll(state);
	// A full clear here, not the usual per-line erase: rows that existed under the
	// old geometry would otherwise be left behind below the new frame.
	process.stdout.write(clearScreen);
	previousFrame = [];
	draw(state, true);
}

/**
 * Resize watching without SIGWINCH. Ask the terminal for its size on a timer and let
 * the answer arrive through stdin; if it never answers (XTWINOPS is optional, and some
 * terminals disable it), fall back to shelling out to `stty` at a slower cadence.
 */
/** Poll cadence for the size query. Override with GITTLES_RESIZE_MS to feel the
 * difference: lower tracks a window drag more closely, at 5 bytes written per tick. */
function resizePollMs(): number {
	const raw = process.env['GITTLES_RESIZE_MS'];
	if (raw === undefined) {
		return 100;
	}

	const parsed = Number(raw);
	return parsed >= 16 && parsed <= 5000 ? parsed : 100;
}

function watchSize(state: State): void {
	setInterval(() => {
		process.stdout.write(SIZE_QUERY);
	}, resizePollMs());

	setInterval(() => {
		// Only pay for a fork if the terminal never answered the query.
		if (state.sizeReportSeen) {
			return;
		}

		const measured = measureNow();
		if (measured !== undefined) {
			resize(state, measured);
		}
	}, 2000);

	process.stdout.write(SIZE_QUERY);
}

async function commitUnstars(state: State): Promise<void> {
	const token = loadConfig().token;
	if (token === '') {
		state.status = red('sign in first: gittles login');
		draw(state, false);
		return;
	}

	const targets: Star[] = [];
	for (const star of state.all) {
		if (state.marked.includes(star.id)) {
			targets.push(star);
		}
	}

	state.mode = 'busy';
	let done = 0;
	let failed = 0;

	// Only what GitHub actually accepted leaves the local store — otherwise a failed
	// unstar would vanish from the list while still being starred on GitHub.
	const removed = new Set<number>();

	for (const star of targets) {
		state.status = dim(
			`unstarring ${star.fullName} (${done + failed + 1}/${targets.length})…`,
		);
		draw(state, false);

		try {
			await unstar(token, star.fullName);
			removed.add(star.id);
			done += 1;
		} catch {
			failed += 1;
		}
	}

	const remaining: Star[] = [];
	for (const star of state.all) {
		if (!removed.has(star.id)) {
			remaining.push(star);
		}
	}

	state.all = remaining;
	// Anything that failed stays marked, so it can be retried.
	const stillMarked: number[] = [];
	for (const id of state.marked) {
		if (!removed.has(id)) {
			stillMarked.push(id);
		}
	}

	state.marked = stillMarked;
	saveStars(remaining);
	applyFilter(state);

	if (state.selected >= state.rows.length) {
		state.selected = Math.max(0, state.rows.length - 1);
	}

	clampScroll(state);
	state.mode = 'list';
	state.status =
		failed === 0
			? green(`unstarred ${done}`)
			: yellow(`unstarred ${done}, ${failed} failed`);
	draw(state, false);
}

/** Download and swap the binary, narrating into the status line. */
async function runUpdate(state: State): Promise<void> {
	state.mode = 'busy';
	state.status = dim('looking up the release…');
	draw(state, false);

	try {
		const release = await fetchLatestRelease();
		const installed = await installUpdate(release, message => {
			state.status = dim(message);
			draw(state, false);
		});

		state.updateAvailable = '';
		state.status = green(`updated to ${installed} — restart gittles`);
	} catch (error: unknown) {
		state.status = red(
			`update failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	state.mode = 'list';
	draw(state, false);
}

function handleListKey(state: State, key: Key): void {
	const last = Math.max(0, state.rows.length - 1);
	const page = rowWindow();

	if (key.name === 'up' || key.name === 'k') {
		state.selected = Math.max(0, state.selected - 1);
		return;
	}

	if (key.name === 'down' || key.name === 'j') {
		state.selected = Math.min(last, state.selected + 1);
		return;
	}

	if (key.name === 'pageup') {
		state.selected = Math.max(0, state.selected - page);
		return;
	}

	if (key.name === 'pagedown') {
		state.selected = Math.min(last, state.selected + page);
		return;
	}

	if (key.name === 'home' || key.name === 'g') {
		state.selected = 0;
		return;
	}

	if (key.name === 'end' || key.name === 'G') {
		state.selected = last;
		return;
	}

	if (key.name === '/' || key.name === 's') {
		state.mode = 'search';
		return;
	}

	if (key.name === 'x') {
		state.query = '';
		state.selected = 0;
		state.offset = 0;
		applyFilter(state);
		return;
	}

	if (key.name === '?') {
		state.mode = 'help';
		return;
	}

	if (key.name === 'u') {
		state.marked = [];
		state.status = dim('cleared marks');
		return;
	}

	if (key.name === 'S' && state.updateAvailable !== '') {
		skipVersion(state.updateAvailable);
		state.status = dim(`skipped ${state.updateAvailable}`);
		state.updateAvailable = '';
		return;
	}

	if (state.rows.length === 0 || state.selected >= state.rows.length) {
		return;
	}

	const current = state.rows[state.selected];

	if (key.name === 'o') {
		state.status = openUrl(current.url)
			? green(`opened ${current.fullName}`)
			: red('could not open a browser');
		return;
	}

	if (key.name === 'd') {
		const index = state.marked.indexOf(current.id);
		if (index >= 0) {
			state.marked.splice(index, 1);
		} else {
			state.marked.push(current.id);
		}

		state.selected = Math.min(last, state.selected + 1);
	}
}

function handleSearchKey(state: State, key: Key): void {
	if (key.name === 'escape' || key.name === 'return') {
		state.mode = 'list';
		return;
	}

	if (key.name === 'backspace') {
		state.query = state.query.slice(0, state.query.length - 1);
		state.selected = 0;
		state.offset = 0;
		applyFilter(state);
		return;
	}

	if (key.name === 'up' || key.name === 'down') {
		state.mode = 'list';
		handleListKey(state, key);
		return;
	}

	if (key.raw.length === 1 && key.raw.charCodeAt(0) >= 32) {
		state.query += key.raw;
		state.selected = 0;
		state.offset = 0;
		applyFilter(state);
	}
}

export function browse(stars: Star[]): void {
	const state: State = {
		all: stars,
		rows: stars,
		selected: 0,
		offset: 0,
		query: '',
		mode: 'list',
		marked: [],
		status: '',
		sizeReportSeen: false,
		updateAvailable: '',
	};

	// Auto-wrap off: a line that overflows must be cut, never wrapped onto the next
	// row. Wide glyphs (emoji, CJK) in descriptions count as one char here but two
	// columns on screen, and without this that difference reflows the whole frame.
	process.stdout.write(`${altScreen}${hideCursor}${disableWrap}`);
	process.stdin.setRawMode(true);

	process.on('SIGINT', () => {
		quit();
	});

	draw(state, true);
	watchSize(state);

	// After the first paint, never before it: the UI must not wait on the network.
	checkForUpdate(false)
		.then(version => {
			if (version !== '' && !wasSkipped(version)) {
				state.updateAvailable = version;
				draw(state, false);
			}
		})
		.catch(() => {});

	process.stdin.on('data', (chunk: Buffer) => {
		if (state.mode === 'busy') {
			return;
		}

		// Only real input repaints. The size query answers arrive several times a
		// second, and redrawing on those was a full-frame repaint 10x/s while idle —
		// visible as flicker on any terminal that presents a partial frame.
		let inputSeen = false;

		for (const key of decodeKeys(chunk.toString())) {
			// The terminal's answer to SIZE_QUERY arrives on stdin like any other
			// escape sequence — consume it here so it never reaches the key handling.
			if (key.name === 'size-report') {
				const next = parseSizeReport(key.raw);
				if (next !== undefined) {
					state.sizeReportSeen = true;
					resize(state, next);
				}

				continue;
			}

			inputSeen = true;

			if (key.name === 'ctrl-c') {
				quit();
			}

			if (state.mode === 'help') {
				state.mode = 'list';
				continue;
			}

			if (state.mode === 'search') {
				handleSearchKey(state, key);
				continue;
			}

			if (key.name === 'q') {
				quit();
			}

			if (key.name === 'c' && state.marked.length > 0) {
				commitUnstars(state).catch(() => {});
				return;
			}

			if (key.name === 'U' && state.updateAvailable !== '') {
				runUpdate(state).catch(() => {});
				return;
			}

			state.status = '';
			handleListKey(state, key);
		}

		if (inputSeen) {
			clampScroll(state);
			draw(state, false);
		}
	});
}
