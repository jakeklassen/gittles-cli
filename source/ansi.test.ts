import {describe, expect, test} from 'vitest';
import {
	clampToWidth,
	groupDigits,
	isoToMs,
	padEnd,
	padStart,
	relativeTime,
	truncate,
	visibleWidth,
} from './ansi.js';

const ESC = String.fromCharCode(27);

describe('groupDigits', () => {
	test.each([
		[0, '0'],
		[999, '999'],
		[1000, '1,000'],
		[15_687, '15,687'],
		[1_234_567, '1,234,567'],
	])('%i -> %s', (input, expected) => {
		expect(groupDigits(input)).toBe(expected);
	});
});

describe('visibleWidth', () => {
	test('ignores SGR sequences', () => {
		expect(visibleWidth(`${ESC}[36mhello${ESC}[0m`)).toBe(5);
	});

	test('counts plain text', () => {
		expect(visibleWidth('hello')).toBe(5);
	});
});

describe('clampToWidth', () => {
	test('cuts to a printable width', () => {
		expect(clampToWidth('abcdefgh', 3)).toBe(`abc${ESC}[0m`);
	});

	test('leaves short lines alone', () => {
		expect(clampToWidth('abc', 10)).toBe('abc');
	});

	test('measures printable characters, not escape bytes', () => {
		// The styled string is 14 characters but only 5 columns wide.
		const styled = `${ESC}[36mhello${ESC}[0m`;
		expect(clampToWidth(styled, 5)).toBe(styled);
	});
});

describe('padding', () => {
	test('padEnd measures printable width', () => {
		expect(padEnd(`${ESC}[36mab${ESC}[0m`, 5)).toBe(`${ESC}[36mab${ESC}[0m   `);
	});

	test('padStart measures printable width', () => {
		expect(padStart('ab', 5)).toBe('   ab');
	});

	test('never truncates when already wider', () => {
		expect(padEnd('abcdef', 3)).toBe('abcdef');
	});
});

describe('truncate', () => {
	test('adds an ellipsis', () => {
		expect(truncate('abcdefgh', 4)).toBe('abc…');
	});

	test('leaves short text alone', () => {
		expect(truncate('abc', 4)).toBe('abc');
	});
});

describe('isoToMs', () => {
	test('matches Date.parse for a known timestamp', () => {
		const iso = '2024-01-02T03:04:05Z';
		expect(isoToMs(iso)).toBe(Date.parse(iso));
	});

	test('handles the epoch', () => {
		expect(isoToMs('1970-01-01T00:00:00Z')).toBe(0);
	});

	test('handles a leap day', () => {
		const iso = '2024-02-29T12:00:00Z';
		expect(isoToMs(iso)).toBe(Date.parse(iso));
	});

	test('returns 0 for junk', () => {
		expect(isoToMs('nope')).toBe(0);
	});
});

describe('relativeTime', () => {
	const ago = (ms: number): string => relativeTime(new Date(Date.now() - ms).toISOString());

	test.each([
		[0, 'just now'],
		[5 * 60_000, '5m ago'],
		[3 * 3_600_000, '3h ago'],
		[2 * 86_400_000, '2d ago'],
		[60 * 86_400_000, '2mo ago'],
		[400 * 86_400_000, '1y ago'],
	])('%i ms -> %s', (elapsed, expected) => {
		expect(ago(elapsed)).toBe(expected);
	});

	test('empty means never', () => {
		expect(relativeTime('')).toBe('never');
	});
});
