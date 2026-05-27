import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'

const MIGRATION_DIRS = [
  'migrations',
  'db/migrations',
  'database/migrations',
  'src/migrations',
  'src/db/migrations',
  'prisma/migrations',
]

const UP_RE = /[._-]up\.[a-z]+$/i
const DOWN_RE = /[._-]down\.[a-z]+$/i

function stem(filename: string, re: RegExp): string {
  return filename.replace(re, '')
}

export const caMigration001: Rule = {
  id: 'CA-MIGRATION001',
  description: 'Migration file has no corresponding rollback (down) migration.',
  defaultSeverity: 'warn',
  applicableModes: ['repo'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const migDir of MIGRATION_DIRS) {
      const absDir = path.join(ctx.repoRoot, migDir)
      if (!fs.existsSync(absDir)) continue

      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true })
      } catch { continue }

      const upFiles = entries.filter((e) => e.isFile() && UP_RE.test(e.name)).map((e) => e.name)
      const downFiles = entries.filter((e) => e.isFile() && DOWN_RE.test(e.name)).map((e) => e.name)

      // Only apply when the project uses explicit up/down file naming
      if (upFiles.length === 0) continue

      for (const upFile of upFiles) {
        const s = stem(upFile, UP_RE)
        if (!downFiles.some((d) => stem(d, DOWN_RE) === s)) {
          findings.push({
            ruleId: 'CA-MIGRATION001',
            severity: 'warn',
            file: path.join(migDir, upFile),
            message: `Migration "${upFile}" has no corresponding rollback migration.`,
            fix: `Create a matching ${s}.down.* file that reverses this migration.`,
          })
        }
      }
    }

    return findings
  },
}