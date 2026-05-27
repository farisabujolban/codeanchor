import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

// A pinned SHA is 7–40 lowercase hex characters
const PINNED_SHA_RE = /^[0-9a-f]{7,40}$/i

function findWorkflowFiles(repoRoot: string): string[] {
  const dir = path.join(repoRoot, '.github', 'workflows')
  if (!fs.existsSync(dir)) return []
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

export const caCi004: Rule = {
  id: 'CA-CI004',
  description: 'GitHub Actions workflow uses an unpinned action ref instead of a full commit SHA.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const workflowFile of findWorkflowFiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, workflowFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const lines = fs.readFileSync(workflowFile, 'utf-8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        // Match: uses: owner/repo@ref  (skip local actions: uses: ./path)
        const m = lines[i].match(/^\s*-?\s*uses:\s*([^./\s][^@\s]*)@([^\s#]+)/)
        if (!m) continue
        const [, action, ref] = m
        if (!PINNED_SHA_RE.test(ref)) {
          findings.push({
            ruleId: 'CA-CI004',
            severity: 'warn',
            file: relPath,
            line: i + 1,
            message: `Action "${action}@${ref}" uses an unpinned ref. Pin to a full commit SHA for reproducibility and security.`,
            fix: `uses: ${action}@<full-sha>  # ${ref}`,
          })
        }
      }
    }

    return findings
  },
}