import type { Comment } from '../types.js';
import type { LanguageDriver } from './languages.js';
export declare function shouldIgnoreComment(comment: Comment, driver: LanguageDriver): boolean;
