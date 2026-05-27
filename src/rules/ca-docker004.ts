import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const CREDENTIAL_NAME_RE = /^(password|passwd|secret|api[_-]?key|apikey|token|auth[_-]?token|private[_-]?key|access[_-]?key|client[_-]?secret|db[_-]?pass(word)?|database[_-]?pass(word)?)$/i

function findDockerfiles(root: string): string[] {
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.'))) {
        files.push(path.join(root, entry.name))
      }
    }
  } catch { /* ignore */ }
  return files
}

export const caDocker004: Rule = {
  id: 'CA-DOCKER004',
  description: 'Dockerfile sets a credential-named ENV or ARG with a hardcoded non-empty default.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const dockerFile of findDockerfiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, dockerFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const lines = fs.readFileSync(dockerFile, 'utf-8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        const lineNum = i + 1

        // ENV PASSWORD=value  (key=value form)
        const envEq = trimmed.match(/^ENV\s+([A-Za-z_][A-Za-z0-9_]*)=(\S+)/i)
        if (envEq && CREDENTIAL_NAME_RE.test(envEq[1]) && envEq[2].length > 0) {
          findings.push({
            ruleId: 'CA-DOCKER004', severity: 'error', file: relPath, line: lineNum,
            message: `ENV "${envEq[1]}" has a hardcoded value. Inject at runtime via environment variables or Docker secrets.`,
          })
          continue
        }

        // ENV PASSWORD value  (legacy space form)
        const envSp = trimmed.match(/^ENV\s+([A-Za-z_][A-Za-z0-9_]*)\s+(\S+)/i)
        if (envSp && CREDENTIAL_NAME_RE.test(envSp[1]) && envSp[2].length > 0) {
          findings.push({
            ruleId: 'CA-DOCKER004', severity: 'error', file: relPath, line: lineNum,
            message: `ENV "${envSp[1]}" has a hardcoded value. Inject at runtime via environment variables or Docker secrets.`,
          })
          continue
        }

        // ARG SECRET_KEY=default_value
        const argM = trimmed.match(/^ARG\s+([A-Za-z_][A-Za-z0-9_]*)=(\S+)/i)
        if (argM && CREDENTIAL_NAME_RE.test(argM[1]) && argM[2].length > 0) {
          findings.push({
            ruleId: 'CA-DOCKER004', severity: 'error', file: relPath, line: lineNum,
            message: `ARG "${argM[1]}" has a hardcoded default credential value. Remove the default and pass it at build time.`,
          })
        }
      }
    }
    return findings
  },
}