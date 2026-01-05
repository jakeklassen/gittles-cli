import {createOAuthDeviceAuth} from '@octokit/auth-oauth-device';
import {Octokit} from '@octokit/rest';
import {getAccessToken, setAccessToken, setUsername} from './config.js';

const GITHUB_CLIENT_ID = 'Ov23ligv9nNkVGihgxUF';

type DeviceVerification = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
};

export type OnVerificationCallback = (verification: DeviceVerification) => void;

export async function authenticate(
	onVerification: OnVerificationCallback,
): Promise<Octokit> {
	const clientId = process.env['GITHUB_CLIENT_ID'] ?? GITHUB_CLIENT_ID;

	const auth = createOAuthDeviceAuth({
		clientType: 'oauth-app',
		clientId,
		scopes: ['read:user', 'repo'],
		onVerification(verification) {
			onVerification(verification as DeviceVerification);
		},
	});

	const {token} = await auth({type: 'oauth'});

	setAccessToken(token);

	const octokit = new Octokit({auth: token});
	const {data: user} = await octokit.users.getAuthenticated();
	setUsername(user.login);

	return octokit;
}

export function getAuthenticatedOctokit(): Octokit | undefined {
	const token = getAccessToken();

	if (!token) {
		return undefined;
	}

	return new Octokit({auth: token});
}
