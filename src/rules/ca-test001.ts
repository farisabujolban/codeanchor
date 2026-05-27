import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { getHotFiles } from '../git/history.js'
import { isExcluded } from '../util/exclude.js'

const HAS_ASSERTION_RE = /\bexpect\s*\(|\bassert[\s.(]/

// Returns the test file path if it exists, null otherwise
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
    // JS/TS/Go/C/C++/C#
    candidates.push(
      path.join(dir, `${stem}.test${ext}`),
      path.join(dir, `${stem}.spec${ext}`),
      path.join(dir, '__tests__', `${stem}${ext}`),
      // also check without the original extension suffix, just base.test.ts etc
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

export const caTest001: Rule = {
  id: 'CA-TEST001',
  description: 'Hot file (frequently changed) has no associated test file.',
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
      if (testFile === null) {
        findings.push({
          ruleId: 'CA-TEST001',
          severity: 'warn',
          file: filePath,
          message: `Hot file changed ${commitCount} times in the last ${since} has no associated test.`,
          fix: `Add a test file for ${path.basename(filePath)}.`,
        })
      } else {
        let testContent = ''
        try { testContent = fs.readFileSync(path.join(ctx.repoRoot, testFile), 'utf-8') }
        catch { /* skip assertion check if unreadable */ }
        if (testContent && !HAS_ASSERTION_RE.test(testContent)) {
          findings.push({
            ruleId: 'CA-TEST001',
            severity: 'warn',
            file: filePath,
            message: `Test file ${testFile} exists but contains no assertions — may be empty boilerplate.`,
            fix: `Add assertions to ${testFile}.`,
          })
        }
      }
    }
    return findings
  },
}
