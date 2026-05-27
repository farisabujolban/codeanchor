import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'

interface PackageJson { version?: string }

const CHANGELOG_NAMES = ['CHANGELOG.md', 'CHANGELOG', 'changelog.md', 'HISTORY.md']

function readVersionFromPath(p: string): string | null {
  if (!fs.existsSync(p)) return null
  try { return (JSON.parse(fs.readFileSync(p, 'utf-8')) as PackageJson).version ?? null }
  catch { return null }
}

function findChangelog(repoRoot: string): string | null {
  for (const name of CHANGELOG_NAMES) {
    const p = path.join(repoRoot, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function changelogHasEntry(changelogPath: string, version: string): boolean {
  const content = fs.readFileSync(changelogPath, 'utf-8')
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^##\\s+\\[?v?${escaped}\\]?`, 'm').test(content)
}

export const caChangelog001: Rule = {
  id: 'CA-CHANGELOG001',
  description: 'package.json version has no matching entry in CHANGELOG.md.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'staged'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    if (ctx.mode === 'staged' && ctx.stagedDiffs) {
      const pkgDiff = ctx.stagedDiffs.find((d) => d.path === 'package.json')
      if (!pkgDiff) return []

      const stagedVersion = readVersionFromPath(path.join(ctx.repoRoot, 'package.json'))
      if (!stagedVersion) return []

      let headVersion: string | null = null
      try {
        const raw = execFileSync('git', ['show', 'HEAD:package.json'], { encoding: 'utf-8', cwd: ctx.repoRoot })
        headVersion = (JSON.parse(raw) as PackageJson).version ?? null
      } catch { /* first commit — HEAD doesn't have package.json */ }

      if (stagedVersion === headVersion) return []

      const changelogTouched = ctx.stagedDiffs.some((d) => /changelog/i.test(d.path))
      if (changelogTouched) return []

      return [{
        ruleId: 'CA-CHANGELOG001',
        severity: 'warn',
        file: 'package.json',
        message: `Version bumped to "${stagedVersion}" but CHANGELOG.md was not staged.`,
      }]
    }

    const version = readVersionFromPath(path.join(ctx.repoRoot, 'package.json'))
    if (!version) return []

    const changelogPath = findChangelog(ctx.repoRoot)
    if (!changelogPath) return []

    if (!changelogHasEntry(changelogPath, version)) {
      return [{
        ruleId: 'CA-CHANGELOG001',
        severity: 'warn',
        file: 'package.json',
        message: `Version "${version}" has no matching entry in ${path.basename(changelogPath)}.`,
        fix: `Add a "## ${version}" section to ${path.basename(changelogPath)}.`,
      }]
    }
    return []
  },
}