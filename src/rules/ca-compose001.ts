import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const COMPOSE_NAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']

function findComposeFiles(root: string): string[] {
  const found: string[] = []
  for (const name of COMPOSE_NAMES) {
    const p = path.join(root, name)
    if (fs.existsSync(p)) found.push(p)
  }
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      for (const name of COMPOSE_NAMES) {
        const p = path.join(root, entry.name, name)
        if (fs.existsSync(p)) found.push(p)
      }
    }
  } catch { /* ignore */ }
  return found
}

function lineOf(rawLines: string[], text: string): number | undefined {
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].includes(text)) return i + 1
  }
  return undefined
}

interface ComposeService {
  depends_on?: string[] | Record<string, unknown>
  volumes?: string[]
  networks?: string[] | Record<string, unknown>
  [key: string]: unknown
}

interface ComposeDoc {
  services?: Record<string, ComposeService>
  volumes?: Record<string, unknown>
  networks?: Record<string, unknown>
  [key: string]: unknown
}

export const caCompose001: Rule = {
  id: 'CA-COMPOSE001',
  description: 'Docker Compose depends_on, volumes, or networks reference a name not declared in the same compose file.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const absPath of findComposeFiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, absPath)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      let raw: string
      try { raw = fs.readFileSync(absPath, 'utf-8') } catch { continue }

      let doc: ComposeDoc
      try { doc = yaml.load(raw) as ComposeDoc } catch { continue }
      if (!doc?.services) continue

      const rawLines = raw.split('\n')
      const definedServices = new Set(Object.keys(doc.services))
      const definedVolumes = new Set(Object.keys(doc.volumes ?? {}))
      const definedNetworks = new Set(Object.keys(doc.networks ?? {}))

      for (const [svcName, svc] of Object.entries(doc.services)) {
        if (!svc) continue

        // Check depends_on
        if (svc.depends_on) {
          const deps = Array.isArray(svc.depends_on) ? svc.depends_on : Object.keys(svc.depends_on)
          for (const dep of deps) {
            if (!definedServices.has(dep)) {
              findings.push({
                ruleId: 'CA-COMPOSE001',
                severity: 'error',
                file: relPath,
                line: lineOf(rawLines, dep),
                message: `Service "${svcName}" depends_on "${dep}" which is not defined in this compose file.`,
                detail: `Defined services: ${[...definedServices].join(', ')}`,
              })
            }
          }
        }

        // Check named volumes (format "volname:/path" — skip bind mounts starting with . / ~)
        if (Array.isArray(svc.volumes)) {
          for (const vol of svc.volumes) {
            if (typeof vol !== 'string') continue
            const volName = vol.split(':')[0]
            if (volName.startsWith('.') || volName.startsWith('/') || volName.startsWith('~')) continue
            if (definedVolumes.size > 0 && !definedVolumes.has(volName)) {
              findings.push({
                ruleId: 'CA-COMPOSE001',
                severity: 'error',
                file: relPath,
                line: lineOf(rawLines, volName),
                message: `Service "${svcName}" uses named volume "${volName}" not declared at top level.`,
                fix: `Add "${volName}:" under the top-level "volumes:" key.`,
              })
            }
          }
        }

        // Check networks
        if (svc.networks) {
          const nets = Array.isArray(svc.networks) ? svc.networks : Object.keys(svc.networks)
          for (const net of nets) {
            if (definedNetworks.size > 0 && !definedNetworks.has(net)) {
              findings.push({
                ruleId: 'CA-COMPOSE001',
                severity: 'error',
                file: relPath,
                line: lineOf(rawLines, net),
                message: `Service "${svcName}" uses network "${net}" not declared at top level.`,
                fix: `Add "${net}:" under the top-level "networks:" key.`,
              })
            }
          }
        }
      }
    }

    return findings
  },
}
