export interface BlameLine {
    lineNumber: number;
    commitHash: string;
    authorTime: number;
    content: string;
}
export declare function getBlameLines(repoRoot: string, filePath: string): BlameLine[];
export declare function getBlameAge(repoRoot: string, filePath: string): Map<number, number>;
