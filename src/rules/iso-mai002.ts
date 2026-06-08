import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const DEFAULT_THRESHOLD = 10

// Intentional re-exporters — skip regardless of symbol count
const BARREL_BASENAMES = new Set([
  'index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs',
  'mod.ts', 'mod.js',
  '__init__.py',
])

const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const PYTHON_EXTS = new Set(['.py'])
const JAVA_EXTS = new Set(['.java'])

function countJsTsExports(content: string): number {
  let count = 0

  // Named declaration exports: export [async] (abstract class | class | function | const | ...) Name
  count += [...content.matchAll(
    /^export\s+(?:async\s+)?(?:(?:abstract\s+)?(?:class|function\*?)|const|let|var|type|interface|enum)\s+\w+/gm,
  )].length

  // export default (any form — not double-counted because the regex above requires a keyword after "export ")
  count += [...content.matchAll(/^export\s+default\b/gm)].length

  // export [type] { A, B, C } [from '...']  — multi-line safe ([^}]+ matches newlines)
  for (const m of content.matchAll(/^export\s+(?:type\s+)?\{([^}]+)\}/gm)) {
    count += m[1].split(',').filter(p => p.trim().length > 0).length
  }

  // export * [as ns] from '...'
  count += [...content.matchAll(/^export\s+(?:type\s+)?\*(?:\s+as\s+\w+)?\s+from\s+['"][^'"]+['"]/gm)].length

  return count
}

function countPythonExports(content: string): number {
  let count = 0
  for (const m of content.matchAll(/^(?:def|class)\s+([a-zA-Z][a-zA-Z0-9_]*)\s*[:(]/gm)) {
    if (!m[1].startsWith('_')) count++
  }
  return count
}

// Java enforces one public type per file at the compiler level, so threshold is 1
function countJavaPublicTypes(content: string): number {
  return [...content.matchAll(
    /^public\s+(?:(?:abstract|final|sealed|non-sealed)\s+)*(?:class|interface|enum|record|@interface)\s+\w+/gm,
  )].length
}

export const isoMai002: Rule = {
  id: 'ISO-MAI002',
  description:
    'File exports too many public symbols — low cohesion (ISO 5055 Maintainability). ' +
    'Configurable threshold via { "ISO-MAI002": { "threshold": 10 } }.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const ruleCfg = ctx.config.rules['ISO-MAI002']
    const threshold =
      ruleCfg && typeof ruleCfg === 'object'
        ? ((ruleCfg as Record<string, unknown>).threshold as number | undefined) ?? DEFAULT_THRESHOLD
        : DEFAULT_THRESHOLD

    let trackedFiles: string[]
    try {
      trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
        .split('\n')
        .filter(Boolean)
    } catch {
      return []
    }

    const findings: Finding[] = []

    for (const relPath of trackedFiles) {
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const ext = path.extname(relPath)
      const base = path.basename(relPath)

      // Skip barrel/index files and TypeScript declaration files
      if (BARREL_BASENAMES.has(base)) continue
      if (base.endsWith('.d.ts')) continue

      let count: number
      let effectiveThreshold = threshold

      if (JS_TS_EXTS.has(ext)) {
        let content: string
        try {
          content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8')
        } catch { continue }
        count = countJsTsExports(content)
      } else if (PYTHON_EXTS.has(ext)) {
        let content: string
        try {
          content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8')
        } catch { continue }
        count = countPythonExports(content)
      } else if (JAVA_EXTS.has(ext)) {
        let content: string
        try {
          content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8')
        } catch { continue }
        count = countJavaPublicTypes(content)
        effectiveThreshold = 1  // Java compiler enforces one public type per file
      } else {
        continue
      }

      if (count > effectiveThreshold) {
        findings.push({
          ruleId: 'ISO-MAI002',
          severity: 'warn',
          file: relPath,
          message:
            `"${relPath}" exports ${count} public symbols (threshold: ${effectiveThreshold}). ` +
            `Consider splitting into more focused modules.`,
          fix: `Break this file into smaller modules, each with a single responsibility.`,
        })
      }
    }

    return findings
  },
}