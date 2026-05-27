import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import {
  findCodeownersPath,
  loadCodeownersEntries,
  isTriviallyBroad,
  patternToRegex,
} from '../util/codeowners.js'

function getTrackedFiles(repoRoot: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: repoRoot })
    return out.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function patternMatchesAny(pattern: string, files: string[]): boolean {
  const re = patternToRegex(pattern)
  return files.some(f => re.test(f.replace(/\\/g, '/')))
}

export const caOwn002: Rule = {
  id: 'CA-OWN002',
  description: 'CODEOWNERS entry pattern matches no tracked files — likely stale after a rename or delete.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const coPath = findCodeownersPath(ctx.repoRoot)
    if (!coPath) return []

    const entries = loadCodeownersEntries(coPath)
    if (entries.length === 0) return []

    const trackedFiles = getTrackedFiles(ctx.repoRoot)
    if (trackedFiles.length === 0) return []

    const relCoPath = path.relative(ctx.repoRoot, coPath)
    const findings: Finding[] = []

    for (const { pattern, line } of entries) {
      if (isTriviallyBroad(pattern)) continue
      if (!patternMatchesAny(pattern, trackedFiles)) {
        findings.push({
          ruleId: 'CA-OWN002',
          severity: 'warn',
          file: relCoPath,
          line,
          message: `CODEOWNERS pattern "${pattern}" matches no tracked files — may be stale.`,
          fix: `Remove or update the pattern "${pattern}" in CODEOWNERS.`,
        })
      }
    }

    return findings
  },
}