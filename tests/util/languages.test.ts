import { describe, it, expect } from 'vitest';
import { getDriver } from '../../src/util/languages.js';

describe('getDriver', () => {
    it('returns cstyle driver for .ts', () => {
        const d = getDriver('src/foo.ts');
        expect(d).not.toBeNull();
        expect(d!.commentStyle).toBe('cstyle');
    });

    it('returns cstyle driver for .js', () => {
        expect(getDriver('src/foo.js')?.commentStyle).toBe('cstyle');
    });

    it('returns python driver for .py', () => {
        const d = getDriver('src/foo.py');
        expect(d).not.toBeNull();
        expect(d!.commentStyle).toBe('python');
    });

    it('returns null for unknown extension', () => {
        expect(getDriver('src/foo.rb')).toBeNull();
    });

    it('returns null for extensionless file', () => {
        expect(getDriver('Makefile')).toBeNull();
    });
});
