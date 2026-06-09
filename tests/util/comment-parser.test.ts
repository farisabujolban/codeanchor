import { describe, it, expect } from 'vitest';
import { extractLeadingComments, findCommentAtLine } from '../../src/util/comment-parser.js';
import { cstyleDriver } from '../../src/util/lang-cstyle.js';
import { pythonDriver } from '../../src/util/lang-python.js';

describe('extractLeadingComments — python', () => {
    it('extracts # comment before code', () => {
        const content = '# Parses the payload\nreturn json.loads(raw)\n';
        const comments = extractLeadingComments(content, pythonDriver);
        expect(comments).toHaveLength(1);
        expect(comments[0].startLine).toBe(1);
        expect(comments[0].ownedCodeStartLine).toBe(2);
    });

    it('extracts docstring before code', () => {
        const content = '"""Process request."""\nreturn do_it()\n';
        const comments = extractLeadingComments(content, pythonDriver);
        expect(comments).toHaveLength(1);
        expect(comments[0].type).toBe('block');
    });

    it('does not extract standalone comment with no following code', () => {
        const content = '# Only a comment\n';
        expect(extractLeadingComments(content, pythonDriver)).toHaveLength(0);
    });
});

describe('findCommentAtLine', () => {
    it('finds the comment starting at a given line', () => {
        const content = '// Fetches data\nconst data = fetch(url)\n';
        const c = findCommentAtLine(content, 1, cstyleDriver);
        expect(c).not.toBeNull();
        expect(c!.startLine).toBe(1);
    });

    it('returns null when no comment at that line', () => {
        const content = 'const x = 1\n';
        expect(findCommentAtLine(content, 1, cstyleDriver)).toBeNull();
    });
});
