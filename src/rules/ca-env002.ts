import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'

const SAFE_SUFFIXES = ['.example', '.sample', '.template', '.test']

function isDangerousEnvFile(filePath: string): boolean {
  const base = filePath.split('/').pop() ?? filePath
  if (!base.startsWith('.env')) return false
  if (SAFE_SUFFIXES.some((s) => base.endsWith(s))) return false
  return true
}

export const caEnv002: Rule = {
  id: 'CA-ENV002',
  description: '.env file (not .env.example) is tracked by git — may expose secrets.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr', 'staged'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    let tracked: string
    try {
      tracked = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
    } catch {
      return []
    }

    const findings: Finding[] = []
    for (const file of tracked.split('\n')) {
      const trimmed = file.trim()
      if (!trimmed) continue
      if (isDangerousEnvFile(trimmed)) {
        findings.push({
          ruleId: 'CA-ENV002',
          severity: 'error',
          file: trimmed,
          message: `"${trimmed}" is tracked by git. Secrets in this file are exposed in the repository.`,
          fix: `git rm --cached "${trimmed}" && echo "${path.basename(trimmed)}" >> .gitignore`,
        })
      }
    }
    return findings
  },
}