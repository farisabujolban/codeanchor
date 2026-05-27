import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import type { Approval, ApprovalsStore, Comment, OwnedRegion } from '../types.js'
import { sha256 } from './hash.js'
import { extractRegionLines } from './ownership.js'

const APPROVALS_DIR = '.commentguard'
const APPROVALS_FILE = 'approvals.json'

function approvalsPath(cwd: string): string {
  return path.join(cwd, APPROVALS_DIR, APPROVALS_FILE)
}

export function loadApprovals(cwd: string = process.cwd()): ApprovalsStore {
  const p = approvalsPath(cwd)
  if (!fs.existsSync(p)) return { approvals: [] }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as ApprovalsStore
  } catch {
    return { approvals: [] }
  }
}

export function saveApprovals(store: ApprovalsStore, cwd: string = process.cwd()): void {
  const dir = path.join(cwd, APPROVALS_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    approvalsPath(cwd),
    JSON.stringify(store, null, 2) + '\n',
    'utf-8',
  )
}

export function findApproval(
  store: ApprovalsStore,
  filePath: string,
  commentStartLine: number,
): Approval | null {
  return (
    store.approvals.find(
      a => a.file === filePath && a.commentLine === commentStartLine,
    ) ?? null
  )
}

export function isApprovalValid(
  approval: Approval,
  comment: Comment,
  lines: string[],
  region: OwnedRegion,
): boolean {
  const currentCommentHash = sha256(comment.text)
  const regionLines = extractRegionLines(lines, region)
  const currentCodeHash = sha256(regionLines.join('\n'))
  return approval.commentHash === currentCommentHash && approval.codeHash === currentCodeHash
}

export function buildApproval(
  filePath: string,
  comment: Comment,
  lines: string[],
  region: OwnedRegion,
  cwd: string = process.cwd(),
): Approval {
  const regionLines = extractRegionLines(lines, region)
  let approvedBy = 'unknown'
  try {
    approvedBy = execSync('git config user.email', { cwd, encoding: 'utf-8' }).trim()
  } catch {
    // not in a git repo or no user.email set
  }

  return {
    file: filePath,
    commentLine: comment.startLine,
    commentHash: sha256(comment.text),
    codeHash: sha256(regionLines.join('\n')),
    approvedAt: new Date().toISOString(),
    approvedBy,
  }
}

export function upsertApproval(store: ApprovalsStore, approval: Approval): void {
  const idx = store.approvals.findIndex(
    a => a.file === approval.file && a.commentLine === approval.commentLine,
  )
  if (idx === -1) {
    store.approvals.push(approval)
  } else {
    store.approvals[idx] = approval
  }
}
