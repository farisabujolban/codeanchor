import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

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

// Strip line/block comments and trailing commas so JSONC can be parsed with JSON.parse.
function stripJsoncComments(content: string): string {
  let withoutComments = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    const next = content[i + 1]

    if (inString) {
      withoutComments += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      withoutComments += ch
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++
      if (i < content.length) withoutComments += '\n'
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) {
        if (content[i] === '\n') withoutComments += '\n'
        i++
      }
      i++
      continue
    }

    withoutComments += ch
  }

  let result = ''
  inString = false
  escaped = false

  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i]

    if (inString) {
      result += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      result += ch
      continue
    }

    if (ch === ',') {
      let j = i + 1
      while (j < withoutComments.length && /\s/.test(withoutComments[j])) j++
      if (withoutComments[j] === '}' || withoutComments[j] === ']') continue
    }

    result += ch
  }

  return result
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
