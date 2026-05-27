export const cstyleDriver = {
    extensions: [
        '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
        '.java', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.go',
    ],
    commentStyle: 'cstyle',
    isCodeLine(line) {
        const t = line.trim();
        return t.length > 0 && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*');
    },
    isCommentLine(line) {
        const t = line.trim();
        return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
    },
    directivePatterns: [
        /eslint-disable/,
        /eslint-enable/,
        /prettier-ignore/,
        /@ts-ignore/,
        /@ts-expect-error/,
        /@ts-nocheck/,
        /@ts-check/,
        /tslint:disable/,
        /tslint:enable/,
        /istanbul ignore/,
        /c8 ignore/,
        /@SuppressWarnings/,
        /\/\/ nolint/,
    ],
};
