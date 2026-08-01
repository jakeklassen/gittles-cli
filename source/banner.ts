import {colorLevel, CSI} from './ansi.js';

/**
 * cfonts' "block" font, for the one word this CLI needs. cfonts colors the font in two
 * layers — the solid face and the outline — which is what `colors: ['cyan', 'yellow']`
 * produced in the Ink version. Same split here: `█` is the face, the box-drawing
 * characters are the outline.
 */
const LINES = [
	' ██████╗ ██╗████████╗████████╗██╗     ███████╗███████╗',
	'██╔════╝ ██║╚══██╔══╝╚══██╔══╝██║     ██╔════╝██╔════╝',
	'██║  ███╗██║   ██║      ██║   ██║     █████╗  ███████╗',
	'██║   ██║██║   ██║      ██║   ██║     ██╔══╝  ╚════██║',
	'╚██████╔╝██║   ██║      ██║   ███████╗███████╗███████║',
	' ╚═════╝ ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚══════╝╚══════╝',
];

const FACE = '36'; // cyan
const OUTLINE = '33'; // yellow

const BLOCK = '█';

/** Which color layer a character belongs to: '' for spaces, which need no styling. */
function layerOf(ch: string): string {
	if (ch === ' ') {
		return '';
	}

	return ch === BLOCK ? FACE : OUTLINE;
}

/** Color a line, emitting one escape per run rather than one per character. */
function colorize(line: string): string {
	let out = '';
	let run = '';
	let runLayer = '';

	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		const layer = layerOf(ch);

		if (layer !== runLayer && run !== '') {
			out += runLayer === '' ? run : `${CSI}${runLayer}m${run}${CSI}0m`;
			run = '';
		}

		runLayer = layer;
		run += ch;
	}

	if (run !== '') {
		out += runLayer === '' ? run : `${CSI}${runLayer}m${run}${CSI}0m`;
	}

	return out;
}

export function banner(): string {
	// A blank line first, so the art has headroom instead of sitting flush against
	// the command the user just typed. (cfonts does this too, unless space: false.)
	const out: string[] = [''];

	for (const line of LINES) {
		out.push(colorLevel === 0 ? line : colorize(line));
	}

	return out.join('\n');
}
