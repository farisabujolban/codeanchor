import { describe, it, expect } from 'vitest';
import { getBlameLines, getBlameAge } from '../../src/git/blame.js';

describe('getBlameLines', () => {
    it('returns empty array for non-existent repo', () => {
        expect(getBlameLines('/nonexistent', 'foo.ts')).toEqual([]);
    });
});

describe('getBlameAge', () => {
    it('returns empty map for non-existent repo', () => {
        expect(getBlameAge('/nonexistent', 'foo.ts').size).toBe(0);
    });
});
