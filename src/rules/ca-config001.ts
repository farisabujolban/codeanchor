import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const ENV_NAMES = ['development', 'production', 'test', 'staging', 'qa', 'local']
const EXTENSIONS = ['.json', '.yaml', '.yml']

interface ConfigFile { name: string; relPath: string; absPath: string }

function findConfigFamily(root: string): ConfigFile[] {
  const configDir = path.join(root, 'config')
  if (!fs.existsSync(configDir)) return []
  const found: ConfigFile[] = []
  for (const envName of ENV_NAMES) {
    for (const ext of EXTENSIONS) {
      const absPath = path.join(configDir, `${envName}${ext}`)
      if (fs.existsSync(absPath)) {
        found.push({ name: envName, relPath: path.relative(root, absPath), absPath })
        break
      }
    }
  }
  return found
}

function flattenKeys(obj: unknown, prefix: string, keys: Set<string>): void {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${k}` : k
    keys.add(full)
    flattenKeys(v, full, keys)
  }
}

function parseConfigFile(absPath: string): Set<string> | null {
  try {
    const raw = fs.readFileSync(absPath, 'utf-8')
    const parsed = absPath.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw)
    const keys = new Set<string>()
    flattenKeys(parsed, '', keys)
    return keys
  } catch { return null }
}

export const caConfig001: Rule = {
  id: 'CA-CONFIG001',
  description: 'A config key present in one environment config file (config/development.json etc.) is absent from another.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const family = findConfigFamily(ctx.repoRoot)
    if (family.length < 2) return []

    const parsed: Array<{ name: string; relPath: string; keys: Set<string> }> = []
    for (const { name, relPath, absPath } of family) {
      if (isExcluded(relPath, ctx.config.exclude)) continue
      const keys = parseConfigFile(absPath)
      if (keys !== null) parsed.push({ name, relPath, keys })
    }
    if (parsed.length < 2) return []

    // Union of all keys
    const allKeys = new Set<string>()
    for (const { keys } of parsed) for (const k of keys) allKeys.add(k)

    // Only flag leaf keys (keys that have no children)
    const leafKeys = [...allKeys].filter(k => ![...allKeys].some(other => other.startsWith(k + '.')))

    const findings: Finding[] = []
    for (const key of leafKeys) {
      const presentIn = parsed.filter(p => p.keys.has(key)).map(p => p.name)
      const missingFrom = parsed.filter(p => !p.keys.has(key))
      if (missingFrom.length === 0) continue

      for (const { relPath, name } of missingFrom) {
        findings.push({
          ruleId: 'CA-CONFIG001',
          severity: 'warn',
          file: relPath,
          message: `Config key "${key}" exists in [${presentIn.join(', ')}] but is missing from ${name}.`,
          fix: `Add "${key}" to ${relPath}.`,
        })
      }
    }

    return findings
  },
}
