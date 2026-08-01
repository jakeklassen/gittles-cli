import {Box, Text, useApp, useInput} from 'ink';
import {useState, useEffect} from 'react';
import open from 'open';
import {formatDistanceToNow} from 'date-fns';
import {db} from '../db/index.js';
import {starsTable} from '../db/schema.js';
import {desc, eq} from 'drizzle-orm';
import {getLastSyncedAt} from '../lib/config.js';

type Star = {
	id: number;
	name: string;
	fullName: string;
	description: string | null;
	url: string;
	language: string | null;
	stargazersCount: number;
	pushedAt: string | null;
};

type RepoBrowserProps = {
	octokit?: import('@octokit/rest').Octokit;
};

export default function RepoBrowser({octokit}: RepoBrowserProps) {
	const {exit} = useApp();
	const [stars, setStars] = useState<Star[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [loading, setLoading] = useState(true);
	const [markedForUnstar, setMarkedForUnstar] = useState<Set<number>>(new Set());
	const [isCommitting, setIsCommitting] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	const filteredStars = searchQuery
		? stars.filter(
				s =>
					s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
					s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
					s.language?.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: stars;

	const visibleCount = 10;
	const startIndex = Math.max(0, selectedIndex - Math.floor(visibleCount / 2));
	const visibleStars = filteredStars.slice(startIndex, startIndex + visibleCount);

	useEffect(() => {
		void db
			.select({
				id: starsTable.id,
				name: starsTable.name,
				fullName: starsTable.fullName,
				description: starsTable.description,
				url: starsTable.url,
				language: starsTable.language,
				stargazersCount: starsTable.stargazersCount,
				pushedAt: starsTable.pushedAt,
			})
			.from(starsTable)
			.orderBy(desc(starsTable.starredAt))
			.then(result => {
				setStars(result);
				setSelectedIndex(0);
				setLoading(false);
			});
	}, []);

	useInput((input, key) => {
		if (isCommitting) return;

		// Search mode input handling
		if (isSearching) {
			if (key.escape) {
				setIsSearching(false);
				return;
			}

			if (key.backspace || key.delete) {
				setSearchQuery(prev => prev.slice(0, -1));
				setSelectedIndex(0);
				return;
			}

			if (key.upArrow || key.downArrow) {
				setIsSearching(false);
				// Fall through to navigation handling
			} else if (input && !key.return) {
				setSearchQuery(prev => prev + input);
				setSelectedIndex(0);
				return;
			}
		}

		if (input === 'q') {
			exit();
		}

		if (input === 's' && !isSearching) {
			setIsSearching(true);
			return;
		}

		if (input === 'x') {
			setSearchQuery('');
			setSelectedIndex(0);
			return;
		}

		if (input === 'o' && filteredStars[selectedIndex]) {
			void open(filteredStars[selectedIndex].url);
		}

		if (input === 'd' && filteredStars[selectedIndex]) {
			const id = filteredStars[selectedIndex].id;
			setMarkedForUnstar(prev => {
				const next = new Set(prev);
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}

				return next;
			});
		}

		if (input === 'c' && markedForUnstar.size > 0 && octokit) {
			setIsCommitting(true);
			const toUnstar = stars.filter(s => markedForUnstar.has(s.id));

			void Promise.all(
				toUnstar.map(async star => {
					const [owner, repo] = star.fullName.split('/');
					await octokit.request('DELETE /user/starred/{owner}/{repo}', {
						owner: owner!,
						repo: repo!,
					});
					await db.delete(starsTable).where(eq(starsTable.id, star.id));
				}),
			).then(() => {
				setStars(prev => prev.filter(s => !markedForUnstar.has(s.id)));
				setMarkedForUnstar(new Set());
				setIsCommitting(false);
				setSelectedIndex(prev => Math.min(prev, stars.length - toUnstar.length - 1));
			});
		}

		if (key.upArrow || input === 'k') {
			setSelectedIndex(prev => Math.max(0, prev - 1));
		}

		if (key.downArrow || input === 'j') {
			setSelectedIndex(prev => Math.min(filteredStars.length - 1, prev + 1));
		}
	});

	if (loading) {
		return <Text>Loading stars...</Text>;
	}

	if (stars.length === 0) {
		return (
			<Box flexDirection="column">
				<Text>
					No stars found. Run <Text color="cyan">gittles sync</Text> to fetch your starred repos.
				</Text>
				<Text dimColor>Press q to quit</Text>
			</Box>
		);
	}

	const formatDate = (dateStr: string | null): string => {
		if (!dateStr) return 'N/A';
		return formatDistanceToNow(new Date(dateStr), {addSuffix: true});
	};

	const lastSynced = getLastSyncedAt();
	const formatLastSynced = (): string => {
		if (!lastSynced) return 'never';
		return formatDistanceToNow(lastSynced, {addSuffix: true});
	};

	const markedStars = stars.filter(s => markedForUnstar.has(s.id));

	if (isCommitting) {
		return <Text>Unstarring {markedStars.length} repos...</Text>;
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text dimColor>
					{stars.length} starred repos • last synced: {formatLastSynced()} •
					{isSearching
						? '↑↓ navigate • esc cancel'
						: '↑↓/jk navigate • s search • o open • d unstar • q quit'}
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>
					{isSearching ? '/' : 'Search:'}{' '}
					<Text color={isSearching ? 'cyan' : undefined}>
						{searchQuery || (isSearching ? '' : '(press s)')}
					</Text>
					{searchQuery && (
						<Text dimColor>
							{' '}
							({filteredStars.length} results{!isSearching && ', x to clear'})
						</Text>
					)}
				</Text>
			</Box>

			{markedStars.length > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					<Text color="yellow">Pending unstar ({markedStars.length}):</Text>
					{markedStars.map(star => (
						<Text key={star.id} color="red">
							{' '}
							- {star.fullName}
						</Text>
					))}
					<Text dimColor> Press c to commit, d to toggle</Text>
				</Box>
			)}

			{visibleStars.map((star, index) => {
				const actualIndex = startIndex + index;
				const isSelected = actualIndex === selectedIndex;
				const isMarked = markedForUnstar.has(star.id);

				return (
					<Box key={star.id} flexDirection="column">
						<Box>
							<Text
								color={isMarked ? 'red' : isSelected ? 'cyan' : undefined}
								bold={isSelected}
								strikethrough={isMarked}
							>
								{isSelected ? '❯ ' : '  '}
								{isMarked ? '✗ ' : ''}
								{star.fullName}
							</Text>
							<Text dimColor> </Text>
							<Text color="yellow">★ {star.stargazersCount.toLocaleString()}</Text>
							<Text dimColor> • </Text>
							<Text dimColor>{formatDate(star.pushedAt)}</Text>
							{star.language && (
								<>
									<Text dimColor> • </Text>
									<Text color="blue">{star.language}</Text>
								</>
							)}
						</Box>
						{isSelected && star.description && (
							<Box marginLeft={2} marginBottom={1}>
								<Text dimColor>{star.description}</Text>
							</Box>
						)}
					</Box>
				);
			})}
			<Box marginTop={1}>
				<Text dimColor>
					{selectedIndex + 1}/{filteredStars.length}
				</Text>
			</Box>
		</Box>
	);
}
