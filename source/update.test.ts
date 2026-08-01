import {describe, expect, test} from 'vitest';
import {isCacheUsable, isNewer} from './update.js';

const HOUR = 3_600_000;
const REPO = 'jakeklassen/gittles-cli';

describe('isCacheUsable', () => {
	const now = 1_785_616_128_192;

	test('a fresh check against the same repo is reused', () => {
		expect(isCacheUsable(REPO, REPO, `${now - HOUR}`, now)).toBe(true);
	});

	test('a version cached from another repo is never reused', () => {
		// The bug this guards: pointing the updater at another repo for testing
		// cached its version, and the real app then offered that release for a day.
		expect(isCacheUsable('cli/cli', REPO, `${now - HOUR}`, now)).toBe(false);
	});

	test('a cache with no recorded repo is a miss', () => {
		// Written by a build from before latestRepo existed.
		expect(isCacheUsable('', REPO, `${now - HOUR}`, now)).toBe(false);
	});

	test('a check older than a day is a miss', () => {
		expect(isCacheUsable(REPO, REPO, `${now - 25 * HOUR}`, now)).toBe(false);
	});

	test('no previous check is a miss', () => {
		expect(isCacheUsable(REPO, REPO, '', now)).toBe(false);
	});

	test('a timestamp from the future is a miss', () => {
		// A clock change should expire the cache, not pin it open forever.
		expect(isCacheUsable(REPO, REPO, `${now + HOUR}`, now)).toBe(false);
	});

	test('junk in the timestamp is a miss', () => {
		expect(isCacheUsable(REPO, REPO, 'nope', now)).toBe(false);
	});
});

describe('isNewer', () => {
	test.each([
		['0.2.0', '0.1.0', true],
		['0.1.1', '0.1.0', true],
		['1.0.0', '0.9.9', true],
		['10.0.0', '9.0.0', true],
		['0.1.0', '0.1.0', false],
		['0.1.0', '0.2.0', false],
		['0.9.9', '1.0.0', false],
	])('%s vs %s -> %s', (candidate, current, expected) => {
		expect(isNewer(candidate, current)).toBe(expected);
	});

	test('tolerates tag prefixes', () => {
		// Release tags are 'v1.2.3'; losing the prefix would zero the major version.
		expect(isNewer('v0.2.0', '0.1.0')).toBe(true);
		expect(isNewer('v10.0.0', '9.0.0')).toBe(true);
		expect(isNewer('v0.1.0', '0.1.0')).toBe(false);
	});

	test('missing components count as zero', () => {
		expect(isNewer('1', '0.9.9')).toBe(true);
		expect(isNewer('1.0', '1.0.0')).toBe(false);
	});
});
