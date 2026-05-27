import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'
import { stripJsoncComments } from '../util/jsonc.js'

function findTsconfigs(root: string): string[] {
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        (entry.name === 'tsconfig.json' || /^tsconfig\..+\.json$/.test(entry.name))
      ) {
        files.push(path.join(root, entry.name))
      }
    }
  } catch { /* ignore */ }
  return files
}

// For a glob pattern like "src/**/*", return the leading fixed directory ("src").
// For a direct path like "src/index.ts", return it as-is.
function extractBasePath(pattern: string): string {
  const starIdx = pattern.search(/[*?{]/)
  if (starIdx === -1) return pattern
  return pattern.slice(0, starIdx).replace(/\/$/, '') || '.'
}

interface TsCompilerOptions {
  baseUrl?: string
  rootDir?: string
  paths?: Record<string, string[]>
}

interface TsConfig {
  include?: string[]
  compilerOptions?: TsCompilerOptions
}

export const caTsconfig001: Rule = {
  id: 'CA-TSCONFIG001',
  description: 'tsconfig.json include, paths, baseUrl, or rootDir references a path that does not exist.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const tsFile of findTsconfigs(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, tsFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      let cfg: TsConfig
      try {
        cfg = JSON.parse(stripJsoncComments(fs.readFileSync(tsFile, 'utf-8'))) as TsConfig
      } catch { continue }

      const tsDir = path.dirname(tsFile)

      function check(rawPath: string, field: string): void {
        const base = extractBasePath(rawPath.replace(/\/\*$/, ''))
        if (!base || base === '.') return
        const resolved = path.resolve(tsDir, base)
        if (!fs.existsSync(resolved)) {
          findings.push({
            ruleId: 'CA-TSCONFIG001',
            severity: 'error',
            file: relPath,
            message: `"${field}" references "${rawPath}" but "${base}" does not exist.`,
          })
        }
      }

      // include array
      for (const entry of cfg.include ?? []) {
        check(entry, 'include')
      }

      const co = cfg.compilerOptions ?? {}

      // baseUrl
      if (co.baseUrl) {
        const resolved = path.resolve(tsDir, co.baseUrl)
        if (!fs.existsSync(resolved)) {
          findings.push({
            ruleId: 'CA-TSCONFIG001',
            severity: 'error',
            file: relPath,
            message: `"compilerOptions.baseUrl" references "${co.baseUrl}" which does not exist.`,
          })
        }
      }

      // rootDir
      if (co.rootDir) {
        const resolved = path.resolve(tsDir, co.rootDir)
        if (!fs.existsSync(resolved)) {
          findings.push({
            ruleId: 'CA-TSCONFIG001',
            severity: 'error',
            file: relPath,
            message: `"compilerOptions.rootDir" references "${co.rootDir}" which does not exist.`,
          })
        }
      }

      // paths — check mapped directories
      for (const [alias, mappings] of Object.entries(co.paths ?? {})) {
        for (const mapping of mappings) {
          check(mapping, `compilerOptions.paths["${alias}"]`)
        }
      }
    }

    return findings
  },
}
