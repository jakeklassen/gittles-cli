import https from 'node:https';
import {CSI, color, cyan, dim, hideCursor, showCursor, yellow} from './ansi.js';

const green = (text: string): string => color(text, '32');

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

type Spinner = {
	stop: (finalLine: string) => void;
};

function startSpinner(label: string): Spinner {
	let i = 0;
	process.stdout.write(hideCursor);

	const timer = setInterval(() => {
		const frame = FRAMES[i % FRAMES.length];
		i += 1;
		process.stdout.write(`\r${CSI}2K${cyan(frame)} ${label}`);
	}, 80);

	return {
		stop(finalLine: string) {
			clearInterval(timer);
			process.stdout.write(`\r${CSI}2K${finalLine}\n${showCursor}`);
		},
	};
}

function progressBar(done: number, total: number, width: number): string {
	const ratio = total === 0 ? 0 : done / total;
	const filled = Math.round(ratio * width);
	let bar = '';
	for (let i = 0; i < width; i += 1) {
		bar += i < filled ? '█' : '░';
	}

	return `${cyan(bar)} ${yellow(`${Math.round(ratio * 100)}%`)}`;
}

function get(host: string, requestPath: string): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const req = https.get(
			{
				hostname: host,
				path: requestPath,
				headers: {'user-agent': 'gittles-spike', accept: 'application/json'},
			},
			response => {
				let length = 0;
				response.on('data', (chunk: Buffer) => {
					length += chunk.length;
				});
				response.on('end', () => {
					resolve(length);
				});
			},
		);
		req.on('error', (error: Error) => {
			reject(error);
		});
	});
}

// Terminal width, so layouts can size themselves like Ink's <Box> does.
// NOTE: process.stdout.columns is SC2020-blocked today — even the spelling the
// compiler's own hint suggests still errors. $COLUMNS (or `stty size`) works.
const envColumns = process.env['COLUMNS'];
const columns = envColumns === undefined ? 80 : Number(envColumns);
console.log(dim(`terminal is ${columns} columns wide`));

// 1. A spinner that animates while a real HTTPS request is in flight.
const spinner = startSpinner('fetching starred repos from GitHub…');
const bytes = await get('api.github.com', '/users/jakeklassen/starred?per_page=100');
spinner.stop(`${green('✔')} fetched ${bytes} bytes`);

// 2. A progress bar driven by a timer.
await new Promise<void>(resolve => {
	let done = 0;
	const total = 40;
	const timer = setInterval(() => {
		done += 1;
		process.stdout.write(`\r${CSI}2K${progressBar(done, total, 30)} ${done}/${total} repos`);
		if (done >= total) {
			clearInterval(timer);
			process.stdout.write('\n');
			resolve();
		}
	}, 25);
});

console.log(green('done'));
