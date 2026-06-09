import { describe, it, expect } from 'vitest';
import { parseSinceDuration, getHotFiles } from '../../src/git/history.js';

describe('parseSinceDuration', () => {
    it('converts 7d to "7 days ago"', () => {
        expect(parseSinceDuration('7d')).toBe('7 days ago');
    });

    it('converts 1d to "1 day ago" (singular)', () => {
        expect(parseSinceDuration('1d')).toBe('1 day ago');
    });

    it('converts 3m to "3 months ago"', () => {
        expect(parseSinceDuration('3m')).toBe('3 months ago');
    });

    it('converts 1y to "1 year ago"', () => {
        expect(parseSinceDuration('1y')).toBe('1 year ago');
    });

    it('passes through unrecognized format unchanged', () => {
        expect(parseSinceDuration('2024-01-01')).toBe('2024-01-01');
    });
});

describe('getHotFiles', () => {
    it('returns empty array for non-existent repo', () => {
        expect(getHotFiles('/nonexistent', '7d')).toEqual([]);
    });
});
