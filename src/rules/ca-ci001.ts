import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

interface WorkflowStep {
  run?: string
  [key: string]: unknown
}

interface WorkflowJob {
  steps?: WorkflowStep[]
  [key: string]: unknown
}

interface Workflow {
  jobs?: Record<string, WorkflowJob>
  [key: string]: unknown
}

function findWorkflowFiles(root: string): string[] {
  const dir = path.join(root, '.github', 'workflows')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map(f => path.join(dir, f))
}

const scriptPattern = /(?:npm run|pnpm run|yarn run|pnpm|yarn)\s+([a-zA-Z0-9:_-]+)/g

function extractScriptNames(runBlock: string): string[] {
  const names: string[] = []
  scriptPattern.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = scriptPattern.exec(runBlock)) !== null) {
    names.push(m[1])
  }
  return names
}

function findScriptLine(rawLines: string[], scriptName: string): number | undefined {
  const re = new RegExp(`(?:npm run|pnpm run|yarn run|pnpm|yarn)\\s+${scriptName}(?:\\s|$)`)
  for (let i = 0; i < rawLines.length; i++) {
    if (re.test(rawLines[i])) return i + 1
  }
  return undefined
}

export const caCi001: Rule = {
  id: 'CA-CI001',
  description: 'GitHub Actions workflow references an npm script missing from package.json.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const pkgPath = path.join(ctx.repoRoot, 'package.json')
    if (!fs.existsSync(pkgPath)) return []
    let scripts: Record<string, string> = {}
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> }
      scripts = pkg.scripts ?? {}
    } catch { return [] }

    const findings: Finding[] = []

    for (const wfFile of findWorkflowFiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, wfFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue
      let doc: Workflow
      const raw = fs.readFileSync(wfFile, 'utf-8')
      try {
        doc = yaml.load(raw) as Workflow
      } catch { continue }
      if (!doc?.jobs) continue
      const rawLines = raw.split('\n')

      for (const job of Object.values(doc.jobs)) {
        for (const step of job.steps ?? []) {
          if (!step.run) continue
          for (const scriptName of extractScriptNames(step.run)) {
            if (!(scriptName in scripts)) {
              findings.push({
                ruleId: 'CA-CI001',
                severity: 'error',
                file: relPath,
                line: findScriptLine(rawLines, scriptName),
                message: `Script "${scriptName}" referenced in workflow but not found in package.json.`,
                detail: `Available: ${Object.keys(scripts).join(', ')}`,
              })
            }
          }
        }
      }
    }

    return findings
  },
}
