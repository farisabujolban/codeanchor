import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

interface SetupNodeStep {
  uses?: string
  with?: Record<string, unknown>
  [key: string]: unknown
}

interface WorkflowJob {
  steps?: SetupNodeStep[]
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

function findLineOf(rawLines: string[], text: string): number | undefined {
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].includes(text)) return i + 1
  }
  return undefined
}

// Extract the Node.js major version from a version string.
// Handles: "18", "18.12.0", "lts/hydrogen", ">=18", "^18.x", "~18"
function extractMajor(version: string): number | null {
  const m = version.match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

export const caCi002: Rule = {
  id: 'CA-CI002',
  description: 'GitHub Actions setup-node version does not match .nvmrc or engines.node in package.json.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    // Prefer .nvmrc as the canonical reference (more specific than an engines range)
    let referenceVersion: string | null = null
    let referenceSource: string | null = null

    const nvmrcPath = path.join(ctx.repoRoot, '.nvmrc')
    if (fs.existsSync(nvmrcPath)) {
      referenceVersion = fs.readFileSync(nvmrcPath, 'utf-8').trim()
      referenceSource = '.nvmrc'
    }

    if (!referenceVersion) {
      const pkgPath = path.join(ctx.repoRoot, 'package.json')
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { engines?: { node?: string } }
          if (pkg.engines?.node) {
            referenceVersion = pkg.engines.node
            referenceSource = 'engines.node in package.json'
          }
        } catch { /* ignore */ }
      }
    }

    if (!referenceVersion || !referenceSource) return []

    const refMajor = extractMajor(referenceVersion)
    if (refMajor === null) return []

    const findings: Finding[] = []

    for (const wfFile of findWorkflowFiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, wfFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const raw = fs.readFileSync(wfFile, 'utf-8')
      let doc: Workflow
      try {
        doc = yaml.load(raw) as Workflow
      } catch { continue }
      if (!doc?.jobs) continue

      const rawLines = raw.split('\n')

      for (const job of Object.values(doc.jobs)) {
        for (const step of job.steps ?? []) {
          if (typeof step.uses !== 'string') continue
          if (!step.uses.startsWith('actions/setup-node')) continue

          const nodeVersion = step.with?.['node-version']
          if (nodeVersion === undefined || nodeVersion === null) continue
          const versionStr = String(nodeVersion)
          const ciMajor = extractMajor(versionStr)
          if (ciMajor === null) continue

          if (ciMajor !== refMajor) {
            findings.push({
              ruleId: 'CA-CI002',
              severity: 'warn',
              file: relPath,
              line: findLineOf(rawLines, versionStr),
              message: `setup-node node-version is ${versionStr} (major ${ciMajor}) but ${referenceSource} specifies ${referenceVersion} (major ${refMajor}).`,
              fix: `Update node-version in ${relPath} to align with ${referenceSource}.`,
            })
          }
        }
      }
    }

    return findings
  },
}