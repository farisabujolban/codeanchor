import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

function walkMd(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(full, results)
    else if (entry.name.endsWith('.md')) results.push(full)
  }
}

function findDocFiles(root: string): string[] {
  const files: string[] = []
  const readme = path.join(root, 'README.md')
  if (fs.existsSync(readme)) files.push(readme)
  walkMd(path.join(root, 'docs'), files)
  return files
}

interface VersionRef {
  found: string
  line: number
}

// Match pkgName@X.Y.Z in any context (install commands, examples, etc.)
function extractPackageVersionRefs(pkgName: string, content: string): VersionRef[] {
  const refs: VersionRef[] = []
  // Escape the package name for use in a regex (handles scoped packages like @scope/name)
  const escaped = pkgName.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[\\-]')
  const re = new RegExp(`${escaped}@(\\d+\\.\\d+\\.\\d+)`, 'g')
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(lines[i])) !== null) {
      refs.push({ found: m[1], line: i + 1 })
    }
  }
  return refs
}

// Match static shields.io version badges: /badge/version-X.Y.Z or /badge/v-X.Y.Z
// Dynamic npm badges (/npm/v/pkgname) are intentionally excluded — they query the registry live
function extractBadgeVersionRefs(content: string): VersionRef[] {
  const refs: VersionRef[] = []
  const re = /shields\.io\/badge\/v?ersion-(\d+\.\d+\.\d+)/g
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(lines[i])) !== null) {
      refs.push({ found: m[1], line: i + 1 })
    }
  }
  return refs
}

export const caDocs004: Rule = {
  id: 'CA-DOCS004',
  description: 'README or docs reference a hardcoded package version that does not match package.json.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const pkgPath = path.join(ctx.repoRoot, 'package.json')
    if (!fs.existsSync(pkgPath)) return []

    let pkgName: string
    let pkgVersion: string
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string; version?: string }
      if (!pkg.name || !pkg.version) return []
      pkgName = pkg.name
      pkgVersion = pkg.version
    } catch { return [] }

    const findings: Finding[] = []

    for (const docFile of findDocFiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, docFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const content = fs.readFileSync(docFile, 'utf-8')

      for (const { found, line } of extractPackageVersionRefs(pkgName, content)) {
        if (found !== pkgVersion) {
          findings.push({
            ruleId: 'CA-DOCS004',
            severity: 'warn',
            file: relPath,
            line,
            message: `Docs reference "${pkgName}@${found}" but package.json version is "${pkgVersion}".`,
            fix: `Update the version reference in ${relPath} to @${pkgVersion}.`,
          })
        }
      }

      for (const { found, line } of extractBadgeVersionRefs(content)) {
        if (found !== pkgVersion) {
          findings.push({
            ruleId: 'CA-DOCS004',
            severity: 'warn',
            file: relPath,
            line,
            message: `Static version badge shows "${found}" but package.json version is "${pkgVersion}".`,
            fix: `Update the badge version in ${relPath} to ${pkgVersion}.`,
          })
        }
      }
    }

    return findings
  },
}