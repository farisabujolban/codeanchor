import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

function findDockerfiles(root: string): string[] {
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        (entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.'))
      ) {
        files.push(path.join(root, entry.name))
      }
    }
  } catch { /* ignore unreadable root */ }
  return files
}

export const caDocker003: Rule = {
  id: 'CA-DOCKER003',
  description: 'Dockerfile FROM uses :latest or has no tag (implicit latest).',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const dockerFile of findDockerfiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, dockerFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const content = fs.readFileSync(dockerFile, 'utf-8')
      const lines = content.split('\n')

      // Track multi-stage aliases so FROM alias lines are not flagged
      const knownAliases = new Set<string>()

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        if (!/^FROM\s+/i.test(trimmed)) continue

        // Strip --platform= and similar flags before splitting
        const withoutFlags = trimmed.replace(/--\w[\w-]*=\S+\s*/g, '')
        const parts = withoutFlags.trim().split(/\s+/)
        // parts: FROM image [AS alias]
        const image = parts[1]

        // Register alias for this stage
        if (parts[2]?.toLowerCase() === 'as' && parts[3]) {
          knownAliases.add(parts[3].toLowerCase())
        }

        if (!image) continue
        if (image.toLowerCase() === 'scratch') continue

        // Multi-stage reference — FROM builder or FROM base
        if (knownAliases.has(image.toLowerCase())) continue

        // Digest reference (@sha256:...) is pinned — OK
        if (image.includes('@')) continue

        const colonIdx = image.lastIndexOf(':')
        const tag = colonIdx !== -1 ? image.slice(colonIdx + 1) : null

        if (tag === null) {
          findings.push({
            ruleId: 'CA-DOCKER003',
            severity: 'warn',
            file: relPath,
            line: i + 1,
            message: `FROM "${image}" has no tag (implicit :latest). Pin to a specific version for reproducibility.`,
            fix: `Replace with a pinned tag, e.g. ${image}:<version>, or use a digest.`,
          })
        } else if (tag === 'latest') {
          findings.push({
            ruleId: 'CA-DOCKER003',
            severity: 'warn',
            file: relPath,
            line: i + 1,
            message: `FROM "${image}" uses :latest. Pin to a specific version for reproducibility.`,
            fix: `Replace :latest with a specific version tag or a digest.`,
          })
        }
      }
    }

    return findings
  },
}