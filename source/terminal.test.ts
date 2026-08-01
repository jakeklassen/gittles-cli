import {describe, expect, test} from 'vitest';
import {decodeKeys, parseSizeReport} from './terminal.js';

const ESC = String.fromCharCode(27);

const names = (chunk: string): string[] => decodeKeys(chunk).map(key => key.name);

describe('decodeKeys', () => {
	test('single printable key', () => {
		expect(names('j')).toEqual(['j']);
	});

	test('a chunk can carry several keypresses', () => {
		// A terminal read is not one key: holding a key delivers a run of them.
		expect(names('jjk')).toEqual(['j', 'j', 'k']);
	});

	test('arrow keys are three bytes, not three keys', () => {
		expect(names(`${ESC}[A`)).toEqual(['up']);
		expect(names(`${ESC}[B`)).toEqual(['down']);
		expect(names(`${ESC}[C${ESC}[D`)).toEqual(['right', 'left']);
	});

	test('navigation sequences', () => {
		expect(names(`${ESC}[5~`)).toEqual(['pageup']);
		expect(names(`${ESC}[6~`)).toEqual(['pagedown']);
		expect(names(`${ESC}[H`)).toEqual(['home']);
		expect(names(`${ESC}[F`)).toEqual(['end']);
	});

	test('control keys', () => {
		expect(names(String.fromCharCode(3))).toEqual(['ctrl-c']);
		expect(names('\r')).toEqual(['return']);
		expect(names(String.fromCharCode(127))).toEqual(['backspace']);
		expect(names('\t')).toEqual(['tab']);
	});

	test('a bare escape is not an escape sequence', () => {
		expect(names(ESC)).toEqual(['escape']);
	});

	test('a size report is tagged, not treated as input', () => {
		// This arrives on stdin whenever the terminal answers SIZE_QUERY. Letting it
		// reach key handling would move the selection on its own.
		expect(names(`${ESC}[8;24;100t`)).toEqual(['size-report']);
	});

	test('a size report mixed in with real keys', () => {
		expect(names(`j${ESC}[8;24;100tk`)).toEqual(['j', 'size-report', 'k']);
	});

	test('raw carries the sequence for printable input', () => {
		expect(decodeKeys('/')[0].raw).toBe('/');
	});
});

describe('parseSizeReport', () => {
	test('parses rows and columns', () => {
		expect(parseSizeReport('[8;24;100t')).toEqual({rows: 24, columns: 100});
	});

	test('rejects other sequences', () => {
		expect(parseSizeReport('[A')).toBeUndefined();
		expect(parseSizeReport('[8;24;100')).toBeUndefined();
		expect(parseSizeReport('[9;24;100t')).toBeUndefined();
	});

	test('rejects nonsense dimensions', () => {
		expect(parseSizeReport('[8;0;0t')).toBeUndefined();
	});
});
