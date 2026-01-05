import Conf from 'conf';

type Schema = {
	accessToken?: string;
	username?: string;
	lastSyncedAt?: string;
};

export const config = new Conf<Schema>({
	projectName: 'gittles',
});

export function getAccessToken(): string | undefined {
	return config.get('accessToken');
}

export function setAccessToken(token: string): void {
	config.set('accessToken', token);
}

export function getUsername(): string | undefined {
	return config.get('username');
}

export function setUsername(username: string): void {
	config.set('username', username);
}

export function isAuthenticated(): boolean {
	return Boolean(getAccessToken());
}

export function clearAuth(): void {
	config.delete('accessToken');
	config.delete('username');
}

export function getLastSyncedAt(): Date | undefined {
	const value = config.get('lastSyncedAt');
	return value ? new Date(value) : undefined;
}

export function setLastSyncedAt(date: Date): void {
	config.set('lastSyncedAt', date.toISOString());
}
