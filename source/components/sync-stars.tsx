import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import {useEffect, useState} from 'react';
import type {Octokit} from '@octokit/rest';
import {syncStars, type SyncProgress} from '../lib/sync.js';

type SyncStarsProps = {
	octokit: Octokit;
	onComplete: (result: SyncProgress) => void;
	limit?: number;
};

export default function SyncStars({octokit, onComplete, limit}: SyncStarsProps) {
	const [progress, setProgress] = useState<SyncProgress>({phase: 'fetching'});
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		syncStars(octokit, setProgress, limit)
			.then(result => {
				onComplete(result);
			})
			.catch((error_: unknown) => {
				setError(error_ instanceof Error ? error_.message : 'Unknown error');
			});
	}, [octokit, onComplete, limit]);

	if (error) {
		return <Text color="red">Sync failed: {error}</Text>;
	}

	if (progress.phase === 'fetching') {
		return (
			<Text>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>{' '}
				Fetching stars from GitHub... {progress.fetched ?? 0} fetched
			</Text>
		);
	}

	if (progress.phase === 'syncing') {
		return (
			<Text>
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>{' '}
				Syncing {progress.fetched} stars to database...
			</Text>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="green">Sync complete!</Text>
			<Text>
				Added: {progress.added}, Removed: {progress.removed}, Updated: {progress.updated}
			</Text>
		</Box>
	);
}
