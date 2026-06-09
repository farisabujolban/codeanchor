import { describe, it, expect } from 'vitest';
import { patternToRegex, isCovered, isTriviallyBroad } from '../../src/util/codeowners.js';

describe('isTriviallyBroad', () => {
    it('returns true for *', () => expect(isTriviallyBroad('*')).toBe(true));
    it('returns true for **', () => expect(isTriviallyBroad('**')).toBe(true));
    it('returns true for /*', () => expect(isTriviallyBroad('/*')).toBe(true));
    it('returns false for specific path', () => expect(isTriviallyBroad('src/foo.ts')).toBe(false));
    it('returns false for partial glob', () => expect(isTriviallyBroad('src/*.ts')).toBe(false));
});

describe('patternToRegex', () => {
    it('matches anchored path from root', () => {
        const re = patternToRegex('/src');
        expect(re.test('src/foo.ts')).toBe(true);
        expect(re.test('other/src/foo.ts')).toBe(false);
    });

    it('matches unanchored pattern anywhere in path', () => {
        const re = patternToRegex('*.ts');
        expect(re.test('src/foo.ts')).toBe(true);
    });

    it('matches ** wildcard across segments', () => {
        const re = patternToRegex('/src/**');
        expect(re.test('src/rules/foo.ts')).toBe(true);
        expect(re.test('other/foo.ts')).toBe(false);
    });
});

describe('isCovered', () => {
    it('returns true when a pattern covers the file', () => {
        expect(isCovered('src/rules/foo.ts', ['/src/**'])).toBe(true);
    });

    it('returns false when no pattern matches', () => {
        expect(isCovered('src/rules/foo.ts', ['/docs/**'])).toBe(false);
    });

    it('handles multiple patterns', () => {
        expect(isCovered('src/foo.ts', ['/docs/**', '/src/**'])).toBe(true);
    });
});
