import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { getHotFiles } from '../git/history.js'
import { isExcluded } from '../util/exclude.js'
import { findCodeownersPath, loadCodeownersEntries, isCovered } from '../util/codeowners.js'

export const caOwn001: Rule = {
  id: 'CA-OWN001',
  description: 'Hot file has no matching entry in CODEOWNERS.',
  defaultSeverity: 'warn',
  applicableModes: ['history'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const coPath = findCodeownersPath(ctx.repoRoot)
    if (!coPath) return []

    const patterns = loadCodeownersEntries(coPath).map(e => e.pattern)
    const since = ctx.since ?? '90d'
    const hotFiles = getHotFiles(ctx.repoRoot, since, 3)
    if (hotFiles.length === 0) return []

    const findings: Finding[] = []
    for (const { path: filePath, commitCount } of hotFiles) {
      if (isExcluded(filePath, ctx.config.exclude)) continue
      if (!isCovered(filePath, patterns)) {
        findings.push({
          ruleId: 'CA-OWN001',
          severity: 'warn',
          file: filePath,
          message: `Hot file changed ${commitCount} times has no CODEOWNERS entry.`,
          fix: `Add an entry for ${filePath} to CODEOWNERS.`,
        })
      }
    }
    return findings
  },
}