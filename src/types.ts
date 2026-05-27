export type Severity = 'error' | 'warn' | 'info'
export type ScanMode = 'staged' | 'repo' | 'pr' | 'history'

export interface Finding {
  ruleId: string
  severity: Severity
  file: string
  line?: number
  message: string
  fix?: string
  detail?: string
}

export interface ScanResult {
  mode: ScanMode
  timestamp: string
  repoRoot: string
  findings: Finding[]
  errorCount: number
  warnCount: number
}

export type CommentType = 'line' | 'block'

export interface Comment {
  type: CommentType
  text: string
  startLine: number
  endLine: number
  ownedCodeStartLine: number
}

export interface OwnedRegion {
  startLine: number
  endLine: number
}

export interface Approval {
  file: string
  commentLine: number
  commentHash: string
  codeHash: string
  approvedAt: string
  approvedBy: string
}

export interface ApprovalsStore {
  approvals: Approval[]
}

export interface FileDiff {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  changedLines: Set<number>
}
