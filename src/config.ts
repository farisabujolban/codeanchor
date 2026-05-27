import fs from 'node:fs'
import path from 'node:path'

export interface RuleConfig {
  severity?: 'error' | 'warn' | 'info'
  maxOwnershipDistance?: number
}

export interface CodeAnchorConfig {
  exclude: string[]
  rules: Record<string, RuleConfig | false | undefined>
}

const DEFAULTS: CodeAnchorConfig = {
  exclude: [],
  rules: {
    'CA-CD001':     { severity: 'error', maxOwnershipDistance: 20 },
    'CA-DOCS001':   { severity: 'error' },
    'CA-DOCS002':   { severity: 'error' },
    'CA-DOCS003':   { severity: 'warn' },
    'CA-CI001':     { severity: 'error' },
    'CA-CI003':     { severity: 'error' },
    'CA-DOCKER001': { severity: 'warn' },
    'CA-DOCKER002': { severity: 'warn' },
    'CA-PKG001':    { severity: 'error' },
    'CA-PKG002':    { severity: 'error' },
    'CA-LOCK001':   { severity: 'error' },
    'CA-TEST001':   { severity: 'warn' },
    'CA-TEST002':   { severity: 'warn' },
    'CA-OWN001':    { severity: 'warn' },
    'CA-TODO003':   { severity: 'warn' },
  },
}

export function loadConfig(cwd: string = process.cwd()): CodeAnchorConfig {
  const configPath = path.join(cwd, 'codeanchor.config.json')
  if (!fs.existsSync(configPath)) return DEFAULTS
  try {
    const user = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<CodeAnchorConfig>
    return {
      exclude: user.exclude ?? DEFAULTS.exclude,
      rules: { ...DEFAULTS.rules, ...user.rules },
    }
  } catch {
    return DEFAULTS
  }
}
