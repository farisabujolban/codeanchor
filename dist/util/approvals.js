import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { sha256 } from './hash.js';
import { extractRegionLines } from './ownership.js';
const APPROVALS_DIR = '.commentguard';
const APPROVALS_FILE = 'approvals.json';
function approvalsPath(cwd) {
    return path.join(cwd, APPROVALS_DIR, APPROVALS_FILE);
}
export function loadApprovals(cwd = process.cwd()) {
    const p = approvalsPath(cwd);
    if (!fs.existsSync(p))
        return { approvals: [] };
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    catch {
        return { approvals: [] };
    }
}
export function saveApprovals(store, cwd = process.cwd()) {
    const dir = path.join(cwd, APPROVALS_DIR);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(approvalsPath(cwd), JSON.stringify(store, null, 2) + '\n', 'utf-8');
}
export function findApproval(store, filePath, commentStartLine) {
    return (store.approvals.find(a => a.file === filePath && a.commentLine === commentStartLine) ?? null);
}
export function isApprovalValid(approval, comment, lines, region) {
    const currentCommentHash = sha256(comment.text);
    const regionLines = extractRegionLines(lines, region);
    const currentCodeHash = sha256(regionLines.join('\n'));
    return approval.commentHash === currentCommentHash && approval.codeHash === currentCodeHash;
}
export function buildApproval(filePath, comment, lines, region, cwd = process.cwd()) {
    const regionLines = extractRegionLines(lines, region);
    let approvedBy = 'unknown';
    try {
        approvedBy = execSync('git config user.email', { cwd, encoding: 'utf-8' }).trim();
    }
    catch {
        // not in a git repo or no user.email set
    }
    return {
        file: filePath,
        commentLine: comment.startLine,
        commentHash: sha256(comment.text),
        codeHash: sha256(regionLines.join('\n')),
        approvedAt: new Date().toISOString(),
        approvedBy,
    };
}
export function upsertApproval(store, approval) {
    const idx = store.approvals.findIndex(a => a.file === approval.file && a.commentLine === approval.commentLine);
    if (idx === -1) {
        store.approvals.push(approval);
    }
    else {
        store.approvals[idx] = approval;
    }
}
