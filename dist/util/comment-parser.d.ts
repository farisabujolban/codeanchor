import type { Comment } from '../types.js';
import type { LanguageDriver } from './languages.js';
export declare function extractLeadingComments(content: string, driver: LanguageDriver): Comment[];
export declare function findCommentAtLine(content: string, lineNumber: number, driver: LanguageDriver): Comment | null;
