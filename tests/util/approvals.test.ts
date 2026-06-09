import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    loadApprovals,
    saveApprovals,
    findApproval,
    isApprovalValid,
    upsertApproval,
} from '../../src/util/approvals.js';
import { sha256 } from '../../src/util/hash.js';
import type { Approval, ApprovalsStore, Comment, OwnedRegion } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approvals-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApproval(overrides: Partial<Approval> = {}): Approval {
    return {
        file: 'src/foo.ts',
        commentLine: 1,
        commentHash: sha256('// comment'),
        codeHash: sha256('const x = 1'),
        approvedAt: new Date().toISOString(),
        approvedBy: 'test@example.com',
        ...overrides,
    };
}

describe('loadApprovals', () => {
    it('returns empty store when file does not exist', () => {
        expect(loadApprovals(tmpDir)).toEqual({ approvals: [] });
    });

    it('loads saved approvals', () => {
        const store: ApprovalsStore = { approvals: [makeApproval()] };
        saveApprovals(store, tmpDir);
        expect(loadApprovals(tmpDir).approvals).toHaveLength(1);
    });
});

describe('saveApprovals / loadApprovals round-trip', () => {
    it('persists and restores approval data', () => {
        const approval = makeApproval({ file: 'src/bar.ts', commentLine: 5 });
        const store: ApprovalsStore = { approvals: [approval] };
        saveApprovals(store, tmpDir);
        const loaded = loadApprovals(tmpDir);
        expect(loaded.approvals[0].file).toBe('src/bar.ts');
        expect(loaded.approvals[0].commentLine).toBe(5);
    });
});

describe('findApproval', () => {
    it('finds matching approval by file + line', () => {
        const approval = makeApproval({ file: 'src/foo.ts', commentLine: 3 });
        const store: ApprovalsStore = { approvals: [approval] };
        expect(findApproval(store, 'src/foo.ts', 3)).toEqual(approval);
    });

    it('returns null when no match', () => {
        const store: ApprovalsStore = { approvals: [makeApproval()] };
        expect(findApproval(store, 'src/bar.ts', 99)).toBeNull();
    });
});

describe('isApprovalValid', () => {
    it('returns true when hashes match', () => {
        const comment: Comment = { type: 'line', text: '// comment', startLine: 1, endLine: 1, ownedCodeStartLine: 2 };
        const lines = ['// comment', 'const x = 1'];
        const region: OwnedRegion = { startLine: 2, endLine: 2 };
        const approval = makeApproval({
            commentHash: sha256('// comment'),
            codeHash: sha256('const x = 1'),
        });
        expect(isApprovalValid(approval, comment, lines, region)).toBe(true);
    });

    it('returns false when comment changed', () => {
        const comment: Comment = {
            type: 'line',
            text: '// updated comment',
            startLine: 1,
            endLine: 1,
            ownedCodeStartLine: 2,
        };
        const lines = ['// updated comment', 'const x = 1'];
        const region: OwnedRegion = { startLine: 2, endLine: 2 };
        const approval = makeApproval({
            commentHash: sha256('// old comment'),
            codeHash: sha256('const x = 1'),
        });
        expect(isApprovalValid(approval, comment, lines, region)).toBe(false);
    });
});

describe('upsertApproval', () => {
    it('inserts new approval', () => {
        const store: ApprovalsStore = { approvals: [] };
        upsertApproval(store, makeApproval());
        expect(store.approvals).toHaveLength(1);
    });

    it('updates existing approval with same file + line', () => {
        const store: ApprovalsStore = { approvals: [makeApproval({ approvedBy: 'old@example.com' })] };
        upsertApproval(store, makeApproval({ approvedBy: 'new@example.com' }));
        expect(store.approvals).toHaveLength(1);
        expect(store.approvals[0].approvedBy).toBe('new@example.com');
    });
});
