import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { stripJsoncComments } from '../util/jsonc.js'

function findTsconfigs(root: string): string[] {
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name === 'tsconfig.json' || /^tsconfig\..+\.json$/.test(entry.name))) {
        files.push(path.join(root, entry.name))
      }
    }
  } catch { /* ignore */ }
  return files
}

export const caTsconfig002: Rule = {
  id: 'CA-TSCONFIG002',
  description: 'tsconfig.json does not enable strict mode, weakening TypeScript\'s type checking.',
  defaultSeverity: 'warn',
  applicableModes: ['repo'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const tsFile of findTsconfigs(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, tsFile)
      let parsed: { compilerOptions?: { strict?: boolean } }
      try {
        parsed = JSON.parse(stripJsoncComments(fs.readFileSync(tsFile, 'utf-8')))
      } catch { continue }

      const strict = parsed?.compilerOptions?.strict
      if (strict !== true) {
        findings.push({
          ruleId: 'CA-TSCONFIG002',
          severity: 'warn',
          file: relPath,
          message: strict === false
            ? '"compilerOptions.strict" is explicitly set to false.'
            : '"compilerOptions.strict" is not enabled (defaults to false).',
          fix: 'Add "strict": true to compilerOptions.',
        })
      }
    }

    return findings
  },
}