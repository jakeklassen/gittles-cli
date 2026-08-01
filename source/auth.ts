import {getUsername, request} from './github.js';
import {saveConfig, loadConfig} from './store.js';
import {openUrl} from './terminal.js';
import {bold, cyan, dim, green, yellow} from './ansi.js';
import {startSpinner} from './spinner.js';

const GITHUB_HOST = 'github.com';
const CLIENT_ID = 'Ov23ligv9nNkVGihgxUF';
const SCOPES = 'read:user repo';

type DeviceCode = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	interval: number;
	expires_in: number;
};

/** Both shapes come back on the same endpoint, so both fields are optional. */
type TokenResponse = {
	access_token?: string;
	error?: string;
};

function sleep(ms: number): Promise<void> {
	return new Promise<void>(resolve => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}

async function requestDeviceCode(): Promise<DeviceCode> {
	const response = await request(
		'POST',
		GITHUB_HOST,
		'/login/device/code',
		'',
		'application/json',
		JSON.stringify({client_id: CLIENT_ID, scope: SCOPES}),
	);

	if (response.status !== 200) {
		throw new Error(`device code request failed (HTTP ${response.status})`);
	}

	return JSON.parse(response.body) as DeviceCode;
}

async function pollForToken(device: DeviceCode): Promise<string> {
	const payload = JSON.stringify({
		client_id: CLIENT_ID,
		device_code: device.device_code,
		grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
	});

	let intervalMs = device.interval * 1000;
	const deadline = Date.now() + device.expires_in * 1000;

	while (Date.now() < deadline) {
		await sleep(intervalMs);

		const response = await request(
			'POST',
			GITHUB_HOST,
			'/login/oauth/access_token',
			'',
			'application/json',
			payload,
		);

		const result = JSON.parse(response.body) as TokenResponse;
		const token = result.access_token;
		if (token !== undefined && token !== '') {
			return token;
		}

		const error = result.error;
		if (error === 'authorization_pending') {
			continue;
		}

		if (error === 'slow_down') {
			intervalMs += 5000;
			continue;
		}

		throw new Error(`authorization failed: ${error ?? 'unknown error'}`);
	}

	throw new Error('device code expired — run `gittles login` again');
}

/** The @octokit/auth-oauth-device device flow, hand-rolled. */
export async function login(): Promise<string> {
	const device = await requestDeviceCode();

	console.log('');
	console.log(`  ${dim('1.')} open ${cyan(device.verification_uri)}`);
	console.log(`  ${dim('2.')} enter the code ${bold(yellow(device.user_code))}`);
	console.log('');

	if (openUrl(device.verification_uri)) {
		console.log(dim('  (opened in your browser)'));
		console.log('');
	}

	const spinner = startSpinner('waiting for authorization…');

	try {
		const token = await pollForToken(device);
		spinner.setLabel('fetching your account…');
		const username = await getUsername(token);
		const config = loadConfig();
		saveConfig({
			token: token,
			username: username,
			lastSyncedAt: config.lastSyncedAt,
		});
		spinner.succeed(`authorized as ${green(username)}`);
		return token;
	} catch (error: unknown) {
		spinner.fail(`login failed: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
}
