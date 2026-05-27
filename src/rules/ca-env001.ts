import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'

// Files that serve as the source-of-truth template — we compare others against these
const TEMPLATE_NAMES = new Set(['.env.example', '.env.sample', '.env.template'])

function getTrackedEnvFiles(repoRoot: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: repoRoot })
    return out.trim().split('\n').filter(f => {
      const base = path.basename(f)
      return base === '.env' || base.startsWith('.env.')
    })
  } catch {
    return []
  }
}

function parseEnvKeys(absPath: string): Set<string> {
  const keys = new Set<string>()
  let content: string
  try {
    content = fs.readFileSync(absPath, 'utf-8')
  } catch { return keys }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    keys.add(trimmed.slice(0, eqIdx).trim())
  }
  return keys
}

export const caEnv001: Rule = {
  id: 'CA-ENV001',
  description: '.env.example is missing keys that exist in other tracked env files.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const allEnvFiles = getTrackedEnvFiles(ctx.repoRoot)
    if (allEnvFiles.length === 0) return []

    const templateFiles = allEnvFiles.filter(f => TEMPLATE_NAMES.has(path.basename(f)))
    const otherEnvFiles = allEnvFiles.filter(f => !TEMPLATE_NAMES.has(path.basename(f)))

    // Only run if both sides of the comparison exist
    if (templateFiles.length === 0 || otherEnvFiles.length === 0) return []

    // Merge all template keys into one set
    const templateKeys = new Set<string>()
    for (const tf of templateFiles) {
      for (const key of parseEnvKeys(path.join(ctx.repoRoot, tf))) {
        templateKeys.add(key)
      }
    }

    const templateLabel = templateFiles.map(f => path.basename(f)).join(', ')
    const findings: Finding[] = []

    for (const envFile of otherEnvFiles) {
      const keys = parseEnvKeys(path.join(ctx.repoRoot, envFile))
      for (const key of keys) {
        if (!templateKeys.has(key)) {
          findings.push({
            ruleId: 'CA-ENV001',
            severity: 'warn',
            file: envFile,
            message: `"${key}" is declared in ${path.basename(envFile)} but missing from ${templateLabel}.`,
            fix: `Add "${key}=" to ${templateLabel} to document this environment variable.`,
          })
        }
      }
    }

    return findings
  },
}