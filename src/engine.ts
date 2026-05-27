import type { Finding, ScanResult, ScanMode, FileDiff } from './types.js'
import type { CodeAnchorConfig } from './config.js'
import { allRules } from './rules/index.js'

export interface RuleContext {
  mode: ScanMode
  repoRoot: string
  config: CodeAnchorConfig
  stagedDiffs?: FileDiff[]
  since?: string
  ruleIds?: string[]
}

export interface Rule {
  id: string
  description: string
  defaultSeverity: 'error' | 'warn' | 'info'
  applicableModes: ScanMode[]
  run(ctx: RuleContext): Promise<Finding[]>
}

export async function runEngine(ctx: RuleContext): Promise<ScanResult> {
  const applicableRules = allRules.filter(rule => {
    if (ctx.ruleIds && !ctx.ruleIds.includes(rule.id)) return false
    const ruleCfg = ctx.config.rules[rule.id]
    if (ruleCfg === false) return false
    return rule.applicableModes.includes(ctx.mode)
  })

  const allFindings: Finding[] = []

  for (const rule of applicableRules) {
    const findings = await rule.run(ctx)
    const ruleCfg = ctx.config.rules[rule.id]
    if (typeof ruleCfg === 'object' && ruleCfg?.severity) {
      for (const f of findings) {
        f.severity = ruleCfg.severity as Finding['severity']
      }
    }
    allFindings.push(...findings)
  }

  return {
    mode: ctx.mode,
    timestamp: new Date().toISOString(),
    repoRoot: ctx.repoRoot,
    findings: allFindings,
    errorCount: allFindings.filter(f => f.severity === 'error').length,
    warnCount: allFindings.filter(f => f.severity === 'warn').length,
  }
}
