import type { Approval, ApprovalsStore, Comment, OwnedRegion } from '../types.js';
export declare function loadApprovals(cwd?: string): ApprovalsStore;
export declare function saveApprovals(store: ApprovalsStore, cwd?: string): void;
export declare function findApproval(store: ApprovalsStore, filePath: string, commentStartLine: number): Approval | null;
export declare function isApprovalValid(approval: Approval, comment: Comment, lines: string[], region: OwnedRegion): boolean;
export declare function buildApproval(filePath: string, comment: Comment, lines: string[], region: OwnedRegion, cwd?: string): Approval;
export declare function upsertApproval(store: ApprovalsStore, approval: Approval): void;
