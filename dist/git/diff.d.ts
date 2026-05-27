import type { FileDiff } from '../types.js';
export declare function getStagedDiff(): string;
export declare function getPrDiff(base: string, head: string): string;
export declare function parseDiff(raw: string): FileDiff[];
export declare function diffTouchesRange(fileDiff: FileDiff, startLine: number, endLine: number): boolean;
