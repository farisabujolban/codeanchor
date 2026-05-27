import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

type ExportsValue = string | null | ExportsObject | ExportsValue[]
interface ExportsObject { [key: string]: ExportsValue }

// Collect all local path strings referenced in an `exports` field (recursive)
function collectExportsPaths(value: ExportsValue, results: string[]): void {
  if (typeof value === 'string') {
    results.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectExportsPaths(item, results)
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) collectExportsPaths(v as ExportsValue, results)
  }
}

// Returns true if the string looks like a local path (starts with ./ or ../)
function isLocalPath(s: string): boolean {
  return s.startsWith('./') || s.startsWith('../')
}

interface PkgEntrypoints {
  main?: string
  module?: string
  types?: string
  typings?: string
  bin?: string | Record<string, string>
  exports?: ExportsValue
  files?: string[]
}

function collectEntrypointPaths(pkg: PkgEntrypoints): { field: string; localPath: string }[] {
  const entries: { field: string; localPath: string }[] = []

  for (const field of ['main', 'module', 'types', 'typings'] as const) {
    const v = pkg[field]
    if (typeof v === 'string' && isLocalPath(v)) {
      entries.push({ field, localPath: v })
    }
  }

  if (pkg.bin) {
    if (typeof pkg.bin === 'string') {
      if (isLocalPath(pkg.bin)) entries.push({ field: 'bin', localPath: pkg.bin })
    } else {
      for (const [name, p] of Object.entries(pkg.bin)) {
        if (isLocalPath(p)) entries.push({ field: `bin.${name}`, localPath: p })
      }
    }
  }

  if (pkg.exports !== undefined) {
    const paths: string[] = []
    collectExportsPaths(pkg.exports, paths)
    for (const p of paths) {
      if (isLocalPath(p)) entries.push({ field: 'exports', localPath: p })
    }
  }

  if (Array.isArray(pkg.files)) {
    for (const entry of pkg.files) {
      if (typeof entry === 'string' && isLocalPath(entry)) {
        entries.push({ field: 'files', localPath: entry })
      }
    }
  }

  return entries
}

export const caPkg002: Rule = {
  id: 'CA-PKG002',
  description: 'package.json entrypoint field references a local path that does not exist.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const pkgPath = path.join(ctx.repoRoot, 'package.json')
    if (!fs.existsSync(pkgPath)) return []
    if (isExcluded('package.json', ctx.config.exclude)) return []

    let pkg: PkgEntrypoints
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PkgEntrypoints
    } catch { return [] }

    const findings: Finding[] = []

    for (const { field, localPath } of collectEntrypointPaths(pkg)) {
      // Strip trailing /* glob (e.g. "./dist/*")
      const stripped = localPath.replace(/\/\*$/, '')
      const resolved = path.resolve(ctx.repoRoot, stripped)
      if (!fs.existsSync(resolved)) {
        findings.push({
          ruleId: 'CA-PKG002',
          severity: 'error',
          file: 'package.json',
          message: `package.json "${field}" references "${localPath}" which does not exist.`,
        })
      }
    }

    return findings
  },
}
