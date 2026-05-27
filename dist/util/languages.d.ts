export interface LanguageDriver {
    extensions: string[];
    commentStyle: 'cstyle' | 'python';
    isCodeLine(line: string): boolean;
    isCommentLine(line: string): boolean;
    directivePatterns: RegExp[];
}
export declare function getDriver(filePath: string): LanguageDriver | null;
