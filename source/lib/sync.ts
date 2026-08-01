import {eq, inArray} from 'drizzle-orm';
import type {Octokit} from '@octokit/rest';
import {db} from '../db/index.js';
import {starsTable} from '../db/schema.js';
import {setLastSyncedAt} from './config.js';

export type SyncProgress = {
	phase: 'fetching' | 'syncing' | 'done';
	fetched?: number;
	added?: number;
	removed?: number;
	updated?: number;
};

export type SyncProgressCallback = (progress: SyncProgress) => void;

type StarredRepo = {
	starred_at: string;
	repo: {
		id: number;
		name: string;
		full_name: string;
		description: string | null;
		html_url: string;
		homepage: string | null;
		language: string | null;
		stargazers_count: number;
		forks_count: number;
		open_issues_count: number;
		pushed_at: string | null;
		created_at: string | null;
		updated_at: string | null;
	};
};

async function fetchAllStars(
	octokit: Octokit,
	onProgress?: (fetched: number) => void,
	limit?: number,
): Promise<StarredRepo[]> {
	const stars: StarredRepo[] = [];
	let page = 1;
	const perPage = limit ? Math.min(limit, 100) : 100;

	while (true) {
		const response = await octokit.request('GET /user/starred', {
			per_page: perPage,
			page,
			headers: {
				accept: 'application/vnd.github.star+json',
			},
		});

		const data = response.data as unknown as StarredRepo[];
		stars.push(...data);
		onProgress?.(stars.length);

		if (data.length < perPage) {
			break;
		}

		if (limit && stars.length >= limit) {
			break;
		}

		page++;
	}

	return limit ? stars.slice(0, limit) : stars;
}

export async function syncStars(
	octokit: Octokit,
	onProgress?: SyncProgressCallback,
	limit?: number,
): Promise<SyncProgress> {
	onProgress?.({phase: 'fetching', fetched: 0});

	const remoteStars = await fetchAllStars(
		octokit,
		fetched => {
			onProgress?.({phase: 'fetching', fetched});
		},
		limit,
	);

	onProgress?.({phase: 'syncing', fetched: remoteStars.length});

	const localStars = await db.select({id: starsTable.id}).from(starsTable);
	const localIds = new Set(localStars.map(s => s.id));
	const remoteIds = new Set(remoteStars.map(s => s.repo.id));

	// Find stars to add (in remote but not local)
	const toAdd = remoteStars.filter(s => !localIds.has(s.repo.id));

	// Find stars to remove (in local but not remote)
	const toRemove = [...localIds].filter(id => !remoteIds.has(id));

	// Find stars to update (in both)
	const toUpdate = remoteStars.filter(s => localIds.has(s.repo.id));

	const mapStar = (s: StarredRepo) => ({
		id: s.repo.id,
		name: s.repo.name,
		fullName: s.repo.full_name,
		description: s.repo.description,
		url: s.repo.html_url,
		homepage: s.repo.homepage,
		language: s.repo.language,
		stargazersCount: s.repo.stargazers_count,
		forksCount: s.repo.forks_count,
		openIssuesCount: s.repo.open_issues_count,
		pushedAt: s.repo.pushed_at,
		createdAt: s.repo.created_at,
		updatedAt: s.repo.updated_at,
		starredAt: s.starred_at,
	});

	// Batch insert new stars (100 at a time)
	const batchSize = 100;
	for (let i = 0; i < toAdd.length; i += batchSize) {
		const batch = toAdd.slice(i, i + batchSize);
		await db.insert(starsTable).values(batch.map(mapStar));
	}

	// Remove unstarred repos (batch deletes)
	for (let i = 0; i < toRemove.length; i += batchSize) {
		const batch = toRemove.slice(i, i + batchSize);
		await db.delete(starsTable).where(inArray(starsTable.id, batch));
	}

	// Batch update existing stars
	for (let i = 0; i < toUpdate.length; i += batchSize) {
		const batch = toUpdate.slice(i, i + batchSize);
		for (const star of batch) {
			await db.update(starsTable).set(mapStar(star)).where(eq(starsTable.id, star.repo.id));
		}
	}

	setLastSyncedAt(new Date());

	const result: SyncProgress = {
		phase: 'done',
		fetched: remoteStars.length,
		added: toAdd.length,
		removed: toRemove.length,
		updated: toUpdate.length,
	};

	onProgress?.(result);

	return result;
}
