import {CSI, cyan, dim, green, yellow, hideCursor, showCursor} from './ansi.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

export type Spinner = {
	/** Replace the text shown next to the animating frame. */
	setLabel: (label: string) => void;
	/** Stop animating and leave one final line in the scrollback. */
	succeed: (line: string) => void;
	/** Stop animating and leave a failure line. */
	fail: (line: string) => void;
};

/**
 * ink-spinner in ~20 lines. setInterval and async I/O interleave here the same way
 * they do under Node, so this animates while an HTTPS request is in flight.
 */
export function startSpinner(initialLabel: string): Spinner {
	let label = initialLabel;
	let frame = 0;

	process.stdout.write(hideCursor);

	const timer = setInterval(() => {
		const glyph = FRAMES[frame % FRAMES.length];
		frame += 1;
		process.stdout.write(`\r${CSI}2K${cyan(glyph)} ${label}`);
	}, INTERVAL_MS);

	const finish = (line: string): void => {
		clearInterval(timer);
		process.stdout.write(`\r${CSI}2K${line}\n${showCursor}`);
	};

	return {
		setLabel(next: string) {
			label = next;
		},
		succeed(line: string) {
			finish(`${green('✔')} ${line}`);
		},
		fail(line: string) {
			finish(`${yellow('✖')} ${line}`);
		},
	};
}

/** A block-drawing progress bar, for when the total is known. */
export function progressBar(done: number, total: number, width: number): string {
	const ratio = total === 0 ? 0 : done / total;
	const filled = Math.round(ratio * width);
	let bar = '';
	for (let i = 0; i < width; i += 1) {
		bar += i < filled ? '█' : '░';
	}

	return `${cyan(bar)} ${dim(`${Math.round(ratio * 100)}%`)}`;
}
