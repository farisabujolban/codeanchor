import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'

const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]

const DEP_FIELDS = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'packageManager',
  'overrides',
  'resolutions',
])

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  packageManager?: string
  overrides?: unknown
  resolutions?: unknown
}

function hasDependencyChange(before: PackageJson, after: PackageJson): boolean {
  for (const field of DEP_FIELDS) {
    const a = JSON.stringify((before as Record<string, unknown>)[field] ?? null)
    const b = JSON.stringify((after as Record<string, unknown>)[field] ?? null)
    if (a !== b) return true
  }
  return false
}

function tryShowFile(repoRoot: string, ref: string, relPath: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${relPath}`], {
      encoding: 'utf-8',
      cwd: repoRoot,
    })
  } catch {
    return null
  }
}

function parsePkg(content: string): PackageJson | null {
  try {
    return JSON.parse(content) as PackageJson
  } catch {
    return null
  }
}

export const caLock001: Rule = {
  id: 'CA-LOCK001',
  description: 'Dependency fields in package.json changed but no lockfile was updated.',
  defaultSeverity: 'error',
  applicableModes: ['staged', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const { repoRoot, stagedDiffs, mode } = ctx
    if (!stagedDiffs) return []

    const pkgChanged = stagedDiffs.some(d => d.path === 'package.json')
    if (!pkgChanged) return []

    // Determine which lockfiles exist in the repo
    const presentLockfiles = LOCKFILES.filter(lf =>
      fs.existsSync(path.join(repoRoot, lf)),
    )

    // If no lockfile exists at all and there's no package-manager convention, skip
    if (presentLockfiles.length === 0) return []

    // Check if any lockfile was also changed in the diff
    const lockfileChanged = stagedDiffs.some(d => LOCKFILES.includes(d.path))
    if (lockfileChanged) return []

    // Verify that a dependency-relevant field actually changed (not just scripts/name/etc)
    let depFieldChanged = false

    if (mode === 'staged') {
      const afterContent = fs.existsSync(path.join(repoRoot, 'package.json'))
        ? fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
        : null
      const beforeContent = tryShowFile(repoRoot, 'HEAD', 'package.json')

      if (afterContent && beforeContent) {
        const before = parsePkg(beforeContent)
        const after = parsePkg(afterContent)
        if (before && after) {
          depFieldChanged = hasDependencyChange(before, after)
        } else {
          depFieldChanged = true
        }
      } else {
        depFieldChanged = true
      }
    } else {
      // PR mode: compare base vs head via git show
      const baseDiff = stagedDiffs.find(d => d.path === 'package.json')
      if (!baseDiff) return []

      // We don't have base/head refs in ctx, so fall back to diff-line heuristic:
      // check if any changed line in the diff touches a dependency field name
      const pkgContent = fs.existsSync(path.join(repoRoot, 'package.json'))
        ? fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
        : null
      if (pkgContent) {
        const lines = pkgContent.split('\n')
        for (const lineNum of baseDiff.changedLines) {
          const line = lines[lineNum - 1] ?? ''
          if ([...DEP_FIELDS].some(f => line.includes(`"${f}"`))) {
            depFieldChanged = true
            break
          }
        }
      } else {
        depFieldChanged = true
      }
    }

    if (!depFieldChanged) return []

    return [{
      ruleId: 'CA-LOCK001',
      severity: 'error',
      file: 'package.json',
      message: `Dependency fields changed in package.json but no lockfile (${presentLockfiles.join(', ')}) was updated.`,
      fix: 'Run your package manager install command to regenerate the lockfile.',
    }]
  },
}
