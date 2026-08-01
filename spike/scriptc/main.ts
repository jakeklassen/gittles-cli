import {fetchStars} from './github.js';
import type {Star} from './github.js';
import {clearAuth, loadConfig, loadStars, markSynced, saveStars} from './store.js';
import {browse} from './browser.js';
import {login} from './auth.js';
import {banner} from './banner.js';
import {startSpinner, progressBar} from './spinner.js';
import {cleanupAfterUpdate, fetchLatestRelease, installUpdate, isNewer, VERSION} from './update.js';
import {bold, cyan, dim, green, groupDigits, red, yellow} from './ansi.js';

const args = process.argv.slice(2);
const command = args.length > 0 ? args[0] : 'browse';

// Windows leaves the previous binary parked beside this one after an update.
cleanupAfterUpdate();

function usage(): void {
	console.log(banner());
	console.log('');
	console.log(`  ${bold('gittles')} ${dim('— browse your GitHub stars')}`);
	console.log('');
	console.log(`  ${cyan('gittles')}              browse your stars`);
	console.log(`  ${cyan('gittles sync')} [limit] pull your stars from GitHub`);
	console.log(`  ${cyan('gittles login')}        sign in with GitHub`);
	console.log(`  ${cyan('gittles logout')}       forget the stored token`);
	console.log(`  ${cyan('gittles update')}       install the latest release`);
	console.log(`  ${cyan('gittles version')}      show the version`);
	console.log(`  ${cyan('gittles help')}         this message`);
	console.log('');
}

function diffSummary(before: Star[], after: Star[]): string {
	const beforeIds = new Set<number>();
	for (const star of before) {
		beforeIds.add(star.id);
	}

	const afterIds = new Set<number>();
	for (const star of after) {
		afterIds.add(star.id);
	}

	let added = 0;
	for (const star of after) {
		if (!beforeIds.has(star.id)) {
			added += 1;
		}
	}

	let removed = 0;
	for (const star of before) {
		if (!afterIds.has(star.id)) {
			removed += 1;
		}
	}

	return `${green(`+${added}`)} ${dim('new')}  ${yellow(`-${removed}`)} ${dim('gone')}`;
}

async function ensureToken(): Promise<string> {
	const token = loadConfig().token;
	if (token !== '') {
		return token;
	}

	console.log(banner());
	console.log('');
	console.log(`  ${bold('welcome to gittles')} ${dim('— sign in to get started')}`);
	return login();
}

async function sync(token: string, limit: number): Promise<void> {
	const previous = loadStars();
	const spinner = startSpinner('fetching your stars…');

	try {
		const stars = await fetchStars(token, limit, (fetched, page) => {
			spinner.setLabel(
				limit > 0
					? `${progressBar(fetched, limit, 24)} ${fetched}/${limit} stars`
					: `fetched ${groupDigits(fetched)} stars (page ${page})…`,
			);
		});

		saveStars(stars);
		markSynced();
		spinner.succeed(`synced ${groupDigits(stars.length)} stars  ${diffSummary(previous, stars)}`);
	} catch (error: unknown) {
		spinner.fail(`sync failed: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

async function update(): Promise<void> {
	const spinner = startSpinner('checking for updates…');

	try {
		const release = await fetchLatestRelease();

		if (!isNewer(release.version, VERSION)) {
			spinner.succeed(`already on the latest version (${VERSION})`);
			return;
		}

		spinner.setLabel(`found ${release.version}`);
		const installed = await installUpdate(release, message => {
			spinner.setLabel(message);
		});
		spinner.succeed(`updated ${VERSION} → ${installed}`);
	} catch (error: unknown) {
		spinner.fail(`update failed: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

if (command === 'help' || command === '--help' || command === '-h') {
	usage();
} else if (command === 'version' || command === '--version' || command === '-v') {
	console.log(VERSION);
} else if (command === 'update') {
	await update();
} else if (command === 'logout') {
	clearAuth();
	console.log(`${green('✔')} signed out`);
} else if (command === 'login') {
	await login();
} else if (command === 'sync') {
	const limit = args.length > 1 ? Number(args[1]) : 0;
	const token = await ensureToken();
	await sync(token, limit);
} else if (command === 'browse') {
	const token = await ensureToken();
	let stars = loadStars();

	if (stars.length === 0) {
		console.log(dim('no stars stored yet — syncing first'));
		await sync(token, 0);
		stars = loadStars();
	}

	browse(stars);
} else {
	console.log(`${red('unknown command')} ${bold(command)}`);
	usage();
	process.exit(1);
}
