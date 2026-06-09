export interface LanguageDriver {
    extensions: string[];
    commentStyle: 'cstyle' | 'python';
    isCodeLine(line: string): boolean;
    isCommentLine(line: string): boolean;
    directivePatterns: RegExp[];
}
