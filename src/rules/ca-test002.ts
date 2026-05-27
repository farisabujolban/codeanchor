import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { getHotFiles, getFileCommitCount } from '../git/history.js'
import { isExcluded } from '../util/exclude.js'

function findTestFile(repoRoot: string, sourceFile: string): string | null {
  const dir = path.dirname(sourceFile)
  const base = path.basename(sourceFile)
  const ext = path.extname(base)
  const stem = base.slice(0, -ext.length)

  const candidates: string[] = []

  if (ext === '.py') {
    candidates.push(
      path.join(dir, `test_${stem}.py`),
      path.join(dir, `${stem}_test.py`),
      path.join(dir, 'tests', `test_${stem}.py`),
      path.join('tests', `test_${stem}.py`),
    )
  } else if (ext === '.java') {
    candidates.push(
      path.join(dir, `${stem}Test.java`),
      path.join(dir, `${stem}Spec.java`),
    )
  } else {
    candidates.push(
      path.join(dir, `${stem}.test${ext}`),
      path.join(dir, `${stem}.spec${ext}`),
      path.join(dir, '__tests__', `${stem}${ext}`),
      path.join(dir, `${stem}.test.ts`),
      path.join(dir, `${stem}.test.js`),
      path.join(dir, `${stem}.spec.ts`),
      path.join(dir, `${stem}.spec.js`),
    )
  }

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(repoRoot, candidate))) return candidate
  }
  return null
}

export const caTest002: Rule = {
  id: 'CA-TEST002',
  description: 'Hot file was changed recently but its test file was not touched in the same window.',
  defaultSeverity: 'warn',
  applicableModes: ['history'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const since = ctx.since ?? '90d'
    const hotFiles = getHotFiles(ctx.repoRoot, since, 3)
    if (hotFiles.length === 0) return []

    const findings: Finding[] = []
    for (const { path: filePath, commitCount } of hotFiles) {
      if (isExcluded(filePath, ctx.config.exclude)) continue
      if (!fs.existsSync(path.join(ctx.repoRoot, filePath))) continue
      const testFile = findTestFile(ctx.repoRoot, filePath)
      if (!testFile) continue  // CA-TEST001 handles missing tests

      const testCommits = getFileCommitCount(ctx.repoRoot, testFile, since)
      if (testCommits === 0) {
        findings.push({
          ruleId: 'CA-TEST002',
          severity: 'warn',
          file: filePath,
          message: `Source changed ${commitCount}x but test (${testFile}) was not touched in the last ${since}.`,
          fix: `Review and update ${testFile} to match recent changes.`,
        })
      }
    }
    return findings
  },
}
