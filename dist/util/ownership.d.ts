import type { Comment, OwnedRegion } from '../types.js';
import type { LanguageDriver } from './languages.js';
export declare function getOwnedRegion(comment: Comment, lines: string[], maxDistance: number, driver: LanguageDriver): OwnedRegion | null;
export declare function extractRegionLines(lines: string[], region: OwnedRegion): string[];
