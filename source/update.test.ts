import {describe, expect, test} from 'vitest';
import {isNewer} from './update.js';

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
