import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'

function findDockerfiles(root: string): string[] {
  const found: string[] = []
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (entry.name === 'Dockerfile' || /^Dockerfile\..+/.test(entry.name)) {
        found.push(path.join(root, entry.name))
      }
    }
    // Also check one level deep (e.g. docker/Dockerfile)
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const subDir = path.join(root, entry.name)
      try {
        for (const sub of fs.readdirSync(subDir, { withFileTypes: true })) {
          if (sub.isFile() && (sub.name === 'Dockerfile' || /^Dockerfile\..+/.test(sub.name))) {
            found.push(path.join(subDir, sub.name))
          }
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return found
}

function readDockerignoreLines(root: string): string[] | null {
  const p = path.join(root, '.dockerignore')
  if (!fs.existsSync(p)) return null
  return fs.readFileSync(p, 'utf-8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
}

function patternCovers(lines: string[], target: string): boolean {
  return lines.some(line => {
    // Exact match, glob, or prefix match
    if (line === target) return true
    if (line.endsWith('*') && target.startsWith(line.slice(0, -1))) return true
    if (line === `**/${target}`) return true
    // e.g. "*.pem" covers "cert.pem"
    if (line.startsWith('*.')) {
      const ext = line.slice(1) // ".pem"
      if (target.endsWith(ext)) return true
    }
    return false
  })
}

export const caDocker005: Rule = {
  id: 'CA-DOCKER005',
  description: 'Dockerfile exists but .dockerignore is missing or does not exclude sensitive paths.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const dockerfiles = findDockerfiles(ctx.repoRoot)
    if (dockerfiles.length === 0) return []

    const findings: Finding[] = []
    const lines = readDockerignoreLines(ctx.repoRoot)

    if (lines === null) {
      findings.push({
        ruleId: 'CA-DOCKER005',
        severity: 'error',
        file: path.relative(ctx.repoRoot, dockerfiles[0]),
        message:
          'Dockerfile found but no .dockerignore exists. Build context will include node_modules, .env files, .git history, and any secrets on disk.',
        fix: 'Create a .dockerignore file excluding: node_modules, .env*, .git, *.pem, *.key',
      })
      return findings
    }

    // Check each required exclusion
    const checks: Array<{ target: string; severity: 'error' | 'warn'; message: string; fix: string }> = [
      {
        target: 'node_modules',
        severity: 'warn',
        message: '.dockerignore does not exclude "node_modules" — gigabytes will be sent to the Docker daemon on every build.',
        fix: 'Add "node_modules" to .dockerignore.',
      },
      {
        target: '.env',
        severity: 'error',
        message: '.dockerignore does not exclude ".env" files — secrets may be baked into the image layer.',
        fix: 'Add ".env" and ".env*" to .dockerignore.',
      },
      {
        target: '.git',
        severity: 'warn',
        message: '.dockerignore does not exclude ".git" — full repository history is sent to the daemon and may end up in the image.',
        fix: 'Add ".git" to .dockerignore.',
      },
      {
        target: '*.pem',
        severity: 'warn',
        message: '.dockerignore does not exclude "*.pem" / "*.key" private key files.',
        fix: 'Add "*.pem", "*.key", "*.p12", "*.pfx" to .dockerignore.',
      },
    ]

    for (const check of checks) {
      // For .env, also check for .env* pattern
      const covered =
        check.target === '.env'
          ? patternCovers(lines, '.env') || patternCovers(lines, '.env*') || lines.some(l => /^\.env/.test(l))
          : check.target === '*.pem'
          ? ['*.pem', '*.key', '*.p12', '*.pfx'].some(ext => patternCovers(lines, ext))
          : patternCovers(lines, check.target)

      if (!covered) {
        findings.push({
          ruleId: 'CA-DOCKER005',
          severity: check.severity,
          file: '.dockerignore',
          message: check.message,
          fix: check.fix,
        })
      }
    }

    return findings
  },
}
