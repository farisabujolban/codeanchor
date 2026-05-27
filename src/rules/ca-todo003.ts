import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { getBlameLines } from '../git/blame.js'
import { isExcluded } from '../util/exclude.js'

const TODO_RE = /\b(TODO|FIXME|HACK)\b/
const ISSUE_RE = /#\d+|GH-\d+|https?:\/\//

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.go',
])

const SECONDS_PER_DAY = 86400

function findSourceFiles(repoRoot: string): string[] {
  let raw: string
  try {
    raw = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: repoRoot })
  } catch {
    return []
  }
  return raw.trim().split('\n').filter(f => {
    const ext = path.extname(f)
    return SOURCE_EXTENSIONS.has(ext)
  })
}

const FIXME_RE = /\bFIXME\b/

function scanStagedFIXME(ctx: RuleContext): Finding[] {
  const findings: Finding[] = []
  if (!ctx.stagedDiffs) return findings
  for (const fileDiff of ctx.stagedDiffs) {
    if (fileDiff.status === 'deleted') continue
    if (!SOURCE_EXTENSIONS.has(path.extname(fileDiff.path))) continue
    const absPath = path.join(ctx.repoRoot, fileDiff.path)
    if (!fs.existsSync(absPath)) continue
    let lines: string[]
    try { lines = fs.readFileSync(absPath, 'utf-8').split('\n') }
    catch { continue }
    for (const lineNum of fileDiff.changedLines) {
      const line = lines[lineNum - 1]
      if (line && FIXME_RE.test(line)) {
        findings.push({
          ruleId: 'CA-TODO003',
          severity: 'warn',
          file: fileDiff.path,
          line: lineNum,
          message: 'FIXME comment in staged change — resolve before merging.',
        })
      }
    }
  }
  return findings
}

export const caTodo003: Rule = {
  id: 'CA-TODO003',
  description: 'TODO/FIXME/HACK comment is older than 90 days and has no issue link. In staged mode: flags any FIXME regardless of age.',
  defaultSeverity: 'warn',
  applicableModes: ['history', 'staged'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    if (ctx.mode === 'staged') return scanStagedFIXME(ctx)

    const maxAgeDays = 90
    const maxAgeSeconds = maxAgeDays * SECONDS_PER_DAY
    const now = Date.now() / 1000

    const files = findSourceFiles(ctx.repoRoot)
    const findings: Finding[] = []

    for (const relPath of files) {
      if (isExcluded(relPath, ctx.config.exclude)) continue
      const absPath = path.join(ctx.repoRoot, relPath)
      let content: string
      try {
        content = fs.readFileSync(absPath, 'utf-8')
      } catch {
        continue
      }

      const contentLines = content.split('\n')
      // Quick check — skip files with no TODO/FIXME/HACK
      if (!TODO_RE.test(content)) continue

      const blameLines = getBlameLines(ctx.repoRoot, relPath)
      if (blameLines.length === 0) continue

      const blameByLine = new Map(blameLines.map(bl => [bl.lineNumber, bl]))

      for (let i = 0; i < contentLines.length; i++) {
        const lineContent = contentLines[i]
        if (!TODO_RE.test(lineContent)) continue
        if (ISSUE_RE.test(lineContent)) continue  // has issue link — OK

        const lineNum = i + 1
        const blame = blameByLine.get(lineNum)
        if (!blame) continue

        const ageSeconds = now - blame.authorTime
        if (ageSeconds < maxAgeSeconds) continue

        const ageDays = Math.floor(ageSeconds / SECONDS_PER_DAY)
        findings.push({
          ruleId: 'CA-TODO003',
          severity: 'warn',
          file: relPath,
          line: lineNum,
          message: `TODO/FIXME/HACK comment is ${ageDays} days old with no issue link.`,
          fix: `Add an issue reference (e.g. #123) or resolve the TODO.`,
        })
      }
    }
    return findings
  },
}
