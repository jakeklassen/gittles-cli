import {Text, useApp} from 'ink';
import {useState, useCallback, useEffect} from 'react';
import {isAuthenticated} from './lib/config.js';
import {getAuthenticatedOctokit} from './lib/auth.js';
import AuthFlow from './components/auth-flow.js';
import SyncStars from './components/sync-stars.js';
import RepoBrowser from './components/repo-browser.js';
import type {SyncProgress} from './lib/sync.js';

type AppProps = {
	command?: string;
	limit?: number;
};

export default function App({command, limit}: AppProps) {
	const {exit} = useApp();
	const [authenticated, setAuthenticated] = useState(isAuthenticated());
	const [syncComplete, setSyncComplete] = useState(false);
	const [syncResult, setSyncResult] = useState<SyncProgress | null>(null);

	const handleAuthenticated = useCallback(() => {
		setAuthenticated(true);
	}, []);

	const handleSyncComplete = useCallback((result: SyncProgress) => {
		setSyncResult(result);
		setSyncComplete(true);
	}, []);

	// Exit after sync completes to restore cursor
	useEffect(() => {
		if (!syncComplete) {
			return;
		}

		const timer = setTimeout(() => exit(), 100);
		return () => clearTimeout(timer);
	}, [syncComplete, exit]);

	if (!authenticated) {
		return <AuthFlow onAuthenticated={handleAuthenticated} />;
	}

	const octokit = getAuthenticatedOctokit();

	if (command === 'sync') {
		if (!octokit) {
			return (
				<Text color="red">Not authenticated. Please run gittles first.</Text>
			);
		}

		if (syncComplete && syncResult) {
			return (
				<Text color="green">
					Sync complete! Added: {syncResult.added}, Removed:{' '}
					{syncResult.removed}, Updated: {syncResult.updated}
				</Text>
			);
		}

		return (
			<SyncStars
				octokit={octokit}
				onComplete={handleSyncComplete}
				limit={limit}
			/>
		);
	}

	return <RepoBrowser octokit={octokit} />;
}
