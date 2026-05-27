export interface HotFile {
    path: string;
    commitCount: number;
}
export declare function parseSinceDuration(since: string): string;
export declare function getHotFiles(repoRoot: string, since: string, minCommits?: number): HotFile[];
export declare function getFileCommitCount(repoRoot: string, filePath: string, since: string): number;
