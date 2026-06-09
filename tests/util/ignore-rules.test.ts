import { describe, it, expect } from 'vitest';
import { shouldIgnoreComment } from '../../src/util/ignore-rules.js';
import { cstyleDriver } from '../../src/util/lang-cstyle.js';
import { pythonDriver } from '../../src/util/lang-python.js';
import type { Comment } from '../../src/types.js';

function line(text: string): Comment {
    return { type: 'line', text, startLine: 1, endLine: 1, ownedCodeStartLine: 2 };
}

describe('shouldIgnoreComment — cstyle', () => {
    it('ignores @ts-ignore', () => {
        expect(shouldIgnoreComment(line('// @ts-ignore'), cstyleDriver)).toBe(true);
    });

    it('ignores eslint-disable', () => {
        expect(shouldIgnoreComment(line('// eslint-disable-next-line'), cstyleDriver)).toBe(true);
    });

    it('ignores commented-out import', () => {
        expect(shouldIgnoreComment(line('// import foo from "bar"'), cstyleDriver)).toBe(true);
    });

    it('does not ignore descriptive comment', () => {
        expect(shouldIgnoreComment(line('// Validates the JWT before granting access'), cstyleDriver)).toBe(false);
    });
});

describe('shouldIgnoreComment — python', () => {
    it('ignores commented-out code', () => {
        expect(shouldIgnoreComment(line('# return result'), pythonDriver)).toBe(true);
    });

    it('does not ignore descriptive comment', () => {
        expect(shouldIgnoreComment(line('# Validates the JWT before granting access'), pythonDriver)).toBe(false);
    });
});
