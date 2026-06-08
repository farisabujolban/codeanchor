import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

type ExportsValue = string | null | ExportsObject | ExportsValue[]
interface ExportsObject { [key: string]: ExportsValue }

function collectExportsPaths(value: ExportsValue, results: string[]): void {
  if (typeof value === 'string') {
    results.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectExportsPaths(item, results)
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) collectExportsPaths(v as ExportsValue, results)
  }
}

function matchesFilesPattern(exportPath: string, pattern: string): boolean {
  // Normalize both sides: strip leading './'
  const ep = exportPath.startsWith('./') ? exportPath.slice(2) : exportPath
  const pat = pattern.startsWith('./') ? pattern.slice(2) : pattern

  if (ep === pat) return true
  // Directory prefix: "dist" covers "dist/index.js"
  const dirPrefix = pat.endsWith('/') ? pat : pat + '/'
  if (ep.startsWith(dirPrefix)) return true
  // Glob matching
  const regexStr = pat
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.+')
    .replace(/\*/g, '[^/]+')
  try {
    return new RegExp(`^${regexStr}$`).test(ep)
  } catch { return false }
}

interface PkgShape {
  files?: string[]
  exports?: ExportsValue
}

export const caPkg003: Rule = {
  id: 'CA-PKG003',
  description: 'package.json exports field references a dist/build path not covered by the files field — will be excluded from npm publish.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const pkgPath = path.join(ctx.repoRoot, 'package.json')
    if (!fs.existsSync(pkgPath)) return []
    if (isExcluded('package.json', ctx.config.exclude)) return []

    let pkg: PkgShape
    let rawContent: string
    try {
      rawContent = fs.readFileSync(pkgPath, 'utf-8')
      pkg = JSON.parse(rawContent) as PkgShape
    } catch { return [] }

    if (!pkg.files || !pkg.exports) return []
    if (!Array.isArray(pkg.files) || pkg.files.length === 0) return []

    const allExported: string[] = []
    collectExportsPaths(pkg.exports, allExported)

    // Only check dist/build output paths — skip bare '.' entry and non-local strings
    const outputPaths = allExported.filter(
      p => typeof p === 'string' && (p.startsWith('./dist/') || p.startsWith('./build/'))
    )
    if (outputPaths.length === 0) return []

    const rawLines = rawContent.split('\n')
    const findings: Finding[] = []

    for (const exportPath of outputPaths) {
      const covered = pkg.files.some(pattern => matchesFilesPattern(exportPath, pattern))
      if (!covered) {
        const lineIdx = rawLines.findIndex(l => l.includes(exportPath))
        findings.push({
          ruleId: 'CA-PKG003',
          severity: 'error',
          file: 'package.json',
          line: lineIdx >= 0 ? lineIdx + 1 : undefined,
          message: `exports path "${exportPath}" is not matched by any entry in the "files" field and will be excluded from npm publish.`,
          fix: `Add "${exportPath}" or its parent directory to the "files" array in package.json.`,
        })
      }
    }

    return findings
  },
}
