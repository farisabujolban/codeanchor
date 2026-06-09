import { describe, it, expect } from 'vitest';
import { getOwnedRegion, extractRegionLines } from '../../src/util/ownership.js';
import { cstyleDriver } from '../../src/util/lang-cstyle.js';
import type { Comment } from '../../src/types.js';

function makeComment(startLine: number, endLine: number, ownedCodeStartLine: number): Comment {
    return { type: 'line', text: '// comment', startLine, endLine, ownedCodeStartLine };
}

describe('extractRegionLines', () => {
    it('extracts the correct slice of lines (1-indexed)', () => {
        const lines = ['a', 'b', 'c', 'd', 'e'];
        const region = { startLine: 2, endLine: 4 };
        expect(extractRegionLines(lines, region)).toEqual(['b', 'c', 'd']);
    });

    it('handles single-line region', () => {
        const lines = ['a', 'b', 'c'];
        expect(extractRegionLines(lines, { startLine: 2, endLine: 2 })).toEqual(['b']);
    });
});

describe('getOwnedRegion', () => {
    it('returns region for a comment followed by code', () => {
        const lines = ['// Validates the token', 'const x = validate(token)'];
        const comment = makeComment(1, 1, 2);
        const region = getOwnedRegion(comment, lines, 10, cstyleDriver);
        expect(region).not.toBeNull();
        expect(region!.startLine).toBe(2);
        expect(region!.endLine).toBe(2);
    });

    it('returns null when no code follows within maxDistance', () => {
        const lines = ['// Just a comment'];
        const comment = makeComment(1, 1, 2);
        const region = getOwnedRegion(comment, lines, 10, cstyleDriver);
        expect(region).toBeNull();
    });

    it('skips blank lines to find owned code', () => {
        const lines = ['// A comment', '', 'const x = 1'];
        const comment = makeComment(1, 1, 2);
        const region = getOwnedRegion(comment, lines, 10, cstyleDriver);
        expect(region).not.toBeNull();
        expect(region!.endLine).toBe(3);
    });
});
