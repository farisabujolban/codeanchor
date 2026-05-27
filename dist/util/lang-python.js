export const pythonDriver = {
    extensions: ['.py'],
    commentStyle: 'python',
    isCodeLine(line) {
        const t = line.trim();
        return t.length > 0 && !t.startsWith('#');
    },
    isCommentLine(line) {
        return line.trim().startsWith('#');
    },
    directivePatterns: [
        /# type: ignore/,
        /# noqa/,
        /# pylint:/,
        /# pyright:/,
        /# fmt:/,
        /# pragma:/,
    ],
};
