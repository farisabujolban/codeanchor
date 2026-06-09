import type { LanguageDriver } from './language-driver.js';

export const pythonDriver: LanguageDriver = {
    extensions: ['.py'],
    commentStyle: 'python',
    isCodeLine(line: string): boolean {
        const t = line.trim();
        return t.length > 0 && !t.startsWith('#');
    },
    isCommentLine(line: string): boolean {
        return line.trim().startsWith('#');
    },
    directivePatterns: [/# type: ignore/, /# noqa/, /# pylint:/, /# pyright:/, /# fmt:/, /# pragma:/],
};
