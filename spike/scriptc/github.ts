import https from 'node:https';

export type Star = {
	id: number;
	name: string;
	fullName: string;
	description: string;
	url: string;
	language: string;
	stargazersCount: number;
	forksCount: number;
	openIssuesCount: number;
	pushedAt: string;
	starredAt: string;
};

export type Response = {
	status: number;
	body: string;
};

type ApiRepo = {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	pushed_at: string | null;
};

type ApiStarred = {
	starred_at: string;
	repo: ApiRepo;
};

type ApiUser = {
	login: string;
};

const API_HOST = 'api.github.com';
const USER_AGENT = 'gittles-scriptc-spike';

/** @octokit/rest, minus octokit: one request function over node:https. */
export function request(
	method: string,
	host: string,
	requestPath: string,
	token: string,
	accept: string,
	payload: string,
): Promise<Response> {
	return new Promise<Response>((resolve, reject) => {
		const headers: Record<string, string> = {
			'user-agent': USER_AGENT,
			accept: accept,
		};

		if (token !== '') {
			headers['authorization'] = `Bearer ${token}`;
		}

		if (payload !== '') {
			headers['content-type'] = 'application/json';
			headers['content-length'] = `${payload.length}`;
		}

		const req = https.request(
			{hostname: host, path: requestPath, method: method, headers: headers},
			response => {
				let body = '';
				response.on('data', (chunk: Buffer) => {
					body += chunk.toString();
				});
				response.on('end', () => {
					const status = response.statusCode;
					resolve({status: status === undefined ? 0 : status, body: body});
				});
			},
		);

		req.on('error', (error: Error) => {
			reject(error);
		});

		if (payload !== '') {
			req.write(payload);
		}

		req.end();
	});
}

function fail(what: string, response: Response): Error {
	// Collapse the body to one line: these end up on a single status/spinner line.
	const body = response.body.split('\n').join(' ').split('\r').join('');
	return new Error(
		`${what} failed (HTTP ${response.status}): ${body.slice(0, 120)}`,
	);
}

function toStar(entry: ApiStarred): Star {
	const repo = entry.repo;
	return {
		id: repo.id,
		name: repo.name,
		fullName: repo.full_name,
		description: repo.description === null ? '' : repo.description,
		url: repo.html_url,
		language: repo.language === null ? '' : repo.language,
		stargazersCount: repo.stargazers_count,
		forksCount: repo.forks_count,
		openIssuesCount: repo.open_issues_count,
		pushedAt: repo.pushed_at === null ? '' : repo.pushed_at,
		starredAt: entry.starred_at,
	};
}

export async function getUsername(token: string): Promise<string> {
	const response = await request(
		'GET',
		API_HOST,
		'/user',
		token,
		'application/vnd.github+json',
		'',
	);

	if (response.status !== 200) {
		throw fail('fetching user', response);
	}

	return (JSON.parse(response.body) as ApiUser).login;
}

export type ProgressCallback = (fetched: number, page: number) => void;

/** GET /user/starred, paginated, with the star+json media type for starred_at. */
export async function fetchStars(
	token: string,
	limit: number,
	onProgress: ProgressCallback,
): Promise<Star[]> {
	const stars: Star[] = [];
	let page = 1;

	while (true) {
		const response = await request(
			'GET',
			API_HOST,
			`/user/starred?per_page=100&page=${page}`,
			token,
			'application/vnd.github.star+json',
			'',
		);

		if (response.status !== 200) {
			throw fail('fetching stars', response);
		}

		const entries = JSON.parse(response.body) as ApiStarred[];
		for (const entry of entries) {
			stars.push(toStar(entry));
		}

		onProgress(stars.length, page);

		if (entries.length < 100) {
			break;
		}

		if (limit > 0 && stars.length >= limit) {
			break;
		}

		page += 1;
	}

	return limit > 0 && stars.length > limit ? stars.slice(0, limit) : stars;
}

/** DELETE /user/starred/{owner}/{repo} — 204 on success. */
export async function unstar(token: string, fullName: string): Promise<void> {
	const response = await request(
		'DELETE',
		API_HOST,
		`/user/starred/${fullName}`,
		token,
		'application/vnd.github+json',
		'',
	);

	if (response.status !== 204) {
		throw fail(`unstarring ${fullName}`, response);
	}
}
