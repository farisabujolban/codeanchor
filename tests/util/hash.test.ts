import { describe, it, expect } from 'vitest';
import { sha256 } from '../../src/util/hash.js';

describe('sha256', () => {
    it('returns a 64-character hex string', () => {
        expect(sha256('hello')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
        expect(sha256('foo')).toBe(sha256('foo'));
    });

    it('produces different hashes for different inputs', () => {
        expect(sha256('foo')).not.toBe(sha256('bar'));
    });

    it('handles empty string', () => {
        expect(sha256('')).toMatch(/^[0-9a-f]{64}$/);
    });
});
