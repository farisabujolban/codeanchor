import { describe, it, expect } from 'vitest';
import { isExcluded } from '../../src/util/exclude.js';

describe('isExcluded', () => {
    it('returns false when exclude list is empty', () => {
        expect(isExcluded('src/foo.ts', [])).toBe(false);
    });

    it('matches exact path', () => {
        expect(isExcluded('src/foo.ts', ['src/foo.ts'])).toBe(true);
    });

    it('matches ** glob', () => {
        expect(isExcluded('dist/index.js', ['dist/**'])).toBe(true);
        expect(isExcluded('dist/rules/foo.js', ['dist/**'])).toBe(true);
    });

    it('matches * glob (single segment)', () => {
        expect(isExcluded('src/foo.ts', ['src/*.ts'])).toBe(true);
        expect(isExcluded('src/rules/foo.ts', ['src/*.ts'])).toBe(false);
    });

    it('does not match unrelated path', () => {
        expect(isExcluded('src/foo.ts', ['dist/**', 'node_modules/**'])).toBe(false);
    });

    it('matches node_modules/**', () => {
        expect(isExcluded('node_modules/lodash/index.js', ['node_modules/**'])).toBe(true);
    });
});
