import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.nuxt', 'coverage', '.git'])
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.java', '.cs', '.php'])

// Default pattern covers common JS/TS flag SDKs (LaunchDarkly, Flagsmith, custom)
const DEFAULT_PATTERN_SRC = `(?:flags|featureFlags|ldClient|flagsmith|posthog)\\.(?:isEnabled|get|variation|isFeatureEnabled|isOn)\\(\\s*['"]([^'"]+)['"]`

function collectFlagKeys(configFile: string): Set<string> | null {
  const keys = new Set<string>()
  let parsed: unknown
  try {
    const raw = fs.readFileSync(configFile, 'utf-8')
    parsed = configFile.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw)
  } catch { return null }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item === 'string') keys.add(item)
      else if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>
        for (const field of ['key', 'name', 'id', 'flag']) {
          if (typeof obj[field] === 'string') { keys.add(obj[field] as string); break }
        }
      }
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    // Support { flags: { "key": {...} } } and { "key": true }
    const root = (obj.flags && typeof obj.flags === 'object' ? obj.flags : obj) as Record<string, unknown>
    for (const k of Object.keys(root)) keys.add(k)
  }

  return keys.size > 0 ? keys : null
}

function walkSourceFiles(dir: string, results: string[]): void {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walkSourceFiles(path.join(dir, entry.name), results)
      } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
        results.push(path.join(dir, entry.name))
      }
    }
  } catch { /* ignore */ }
}

export const caFeat001: Rule = {
  id: 'CA-FEAT001',
  description: 'A feature flag key referenced in code is not declared in the flags config file. Requires configFile in rule config. Works for any language — configure pattern to match your SDK.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr', 'staged'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const ruleCfg = ctx.config.rules['CA-FEAT001']
    // Opt-in: must configure { configFile: '...' }
    if (!ruleCfg || typeof ruleCfg !== 'object') return []
    const cfg = ruleCfg as Record<string, unknown>
    if (typeof cfg.configFile !== 'string') return []

    const absConfigFile = path.resolve(ctx.repoRoot, cfg.configFile)
    if (!fs.existsSync(absConfigFile)) return []

    const declaredKeys = collectFlagKeys(absConfigFile)
    if (!declaredKeys) return []

    let pattern: RegExp
    try {
      pattern = typeof cfg.pattern === 'string'
        ? new RegExp(cfg.pattern, 'g')
        : new RegExp(DEFAULT_PATTERN_SRC, 'g')
    } catch { pattern = new RegExp(DEFAULT_PATTERN_SRC, 'g') }

    let filesToScan: string[]
    if (ctx.mode === 'staged' && ctx.stagedDiffs) {
      filesToScan = ctx.stagedDiffs
        .filter(d => d.status !== 'deleted')
        .map(d => path.join(ctx.repoRoot, d.path))
        .filter(p => SOURCE_EXTS.has(path.extname(p)))
    } else {
      filesToScan = []
      walkSourceFiles(ctx.repoRoot, filesToScan)
    }

    const findings: Finding[] = []

    for (const absPath of filesToScan) {
      const relPath = path.relative(ctx.repoRoot, absPath)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      let content: string
      try { content = fs.readFileSync(absPath, 'utf-8') } catch { continue }

      pattern.lastIndex = 0
      const seenInFile = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = pattern.exec(content)) !== null) {
        const key = m[1]
        if (seenInFile.has(key)) continue
        seenInFile.add(key)
        if (!declaredKeys.has(key)) {
          const lineNum = content.slice(0, m.index).split('\n').length
          findings.push({
            ruleId: 'CA-FEAT001',
            severity: 'warn',
            file: relPath,
            line: lineNum,
            message: `Feature flag key "${key}" is not declared in ${cfg.configFile as string}.`,
            fix: `Add "${key}" to ${cfg.configFile as string}.`,
          })
        }
      }
    }

    return findings
  },
}
