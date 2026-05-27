import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

// Match node/ts-node/tsx followed by a local path, or bare local paths
const localPathPattern = /(?:(?:node|ts-node|tsx)\s+)(\.\.?\/\S+)|(\.\.?\/\S+)/g

function extractLocalPaths(scriptValue: string): string[] {
  const paths: string[] = []
  localPathPattern.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = localPathPattern.exec(scriptValue)) !== null) {
    paths.push(m[1] ?? m[2])
  }
  return paths
}

export const caPkg001: Rule = {
  id: 'CA-PKG001',
  description: 'package.json script references a local file that does not exist.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const pkgPath = path.join(ctx.repoRoot, 'package.json')
    if (!fs.existsSync(pkgPath)) return []
    if (isExcluded('package.json', ctx.config.exclude)) return []

    let pkg: { scripts?: Record<string, string> }
    let pkgContent: string
    try {
      pkgContent = fs.readFileSync(pkgPath, 'utf-8')
      pkg = JSON.parse(pkgContent) as { scripts?: Record<string, string> }
    } catch { return [] }
    if (!pkg.scripts) return []

    const findings: Finding[] = []
    const pkgLines = pkgContent.split('\n')

    for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
      for (const localPath of extractLocalPaths(scriptValue)) {
        const resolved = path.resolve(ctx.repoRoot, localPath)
        if (!fs.existsSync(resolved)) {
          const lineIdx = pkgLines.findIndex(
            l => l.includes(`"${scriptName}"`) && l.includes(localPath),
          )
          findings.push({
            ruleId: 'CA-PKG001',
            severity: 'error',
            file: 'package.json',
            line: lineIdx >= 0 ? lineIdx + 1 : undefined,
            message: `Script "${scriptName}" references "${localPath}" which does not exist.`,
          })
        }
      }
    }

    return findings
  },
}
