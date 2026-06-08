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

interface ServiceBuild {
  context?: string
  dockerfile?: string
  [key: string]: unknown
}

interface ComposeService {
  env_file?: string | string[]
  build?: string | ServiceBuild
  [key: string]: unknown
}

interface ComposeDoc {
  services?: Record<string, ComposeService>
  [key: string]: unknown
}

export const caCompose002: Rule = {
  id: 'CA-COMPOSE002',
  description: 'Docker Compose env_file or build.dockerfile references a path that does not exist.',
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
      const composeDir = path.dirname(absPath)

      for (const [svcName, svc] of Object.entries(doc.services)) {
        if (!svc) continue

        // Check env_file entries
        if (svc.env_file) {
          const envFiles = Array.isArray(svc.env_file) ? svc.env_file : [svc.env_file]
          for (const ef of envFiles) {
            if (typeof ef !== 'string') continue
            const resolved = path.resolve(composeDir, ef)
            if (!fs.existsSync(resolved)) {
              findings.push({
                ruleId: 'CA-COMPOSE002',
                severity: 'error',
                file: relPath,
                line: lineOf(rawLines, ef),
                message: `Service "${svcName}" env_file "${ef}" does not exist.`,
                fix: `Create "${ef}" or update the env_file path in ${relPath}.`,
              })
            }
          }
        }

        // Check build.dockerfile and build.context
        if (svc.build && typeof svc.build === 'object') {
          const build = svc.build as ServiceBuild

          if (build.dockerfile) {
            const resolved = path.resolve(composeDir, build.dockerfile)
            if (!fs.existsSync(resolved)) {
              findings.push({
                ruleId: 'CA-COMPOSE002',
                severity: 'error',
                file: relPath,
                line: lineOf(rawLines, build.dockerfile),
                message: `Service "${svcName}" build.dockerfile "${build.dockerfile}" does not exist.`,
              })
            }
          }

          if (build.context) {
            const resolved = path.resolve(composeDir, build.context)
            if (!fs.existsSync(resolved)) {
              findings.push({
                ruleId: 'CA-COMPOSE002',
                severity: 'error',
                file: relPath,
                line: lineOf(rawLines, build.context),
                message: `Service "${svcName}" build.context "${build.context}" does not exist.`,
              })
            }
          }
        }
      }
    }

    return findings
  },
}
