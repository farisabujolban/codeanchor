import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

// Only relative imports create intra-repo edges
const RELATIVE_FROM_RE = /\bfrom\s+['"](\.[^'"]+)['"]/g
const RELATIVE_REQUIRE_RE = /\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g
const RELATIVE_DYNAMIC_RE = /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g
// Python: from .module import X  (module has content after the dots)
const PYTHON_FROM_MODULE_RE = /^\s*from\s+(\.\w[\w.]*)\s+import/gm
// Python: from . import X, Y  (names themselves are the modules)
const PYTHON_FROM_PACKAGE_RE = /^\s*from\s+(\.+)\s+import\s+([^#\n]+)/gm

const JS_TS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const JS_TS_EXT_SET = new Set(JS_TS_EXTS)
const PYTHON_EXT_SET = new Set(['.py'])

const MAX_PATH_DEPTH = 50

/**
 * Resolve a relative import specifier to a tracked repo-relative file path.
 * Returns null if no matching file found in the tracked set.
 */
function resolveSpecifier(
  fromFile: string,
  specifier: string,
  trackedSet: Set<string>,
): string | null {
  const fromDir = path.dirname(fromFile)
  // Normalize: strip query strings or hash fragments
  const cleanSpec = specifier.split('?')[0].split('#')[0]
  const base = path.join(fromDir, cleanSpec).replace(/\\/g, '/')

  // Try exact match first
  if (trackedSet.has(base)) return base

  // Try with JS/TS extensions
  for (const ext of JS_TS_EXTS) {
    const candidate = base + ext
    if (trackedSet.has(candidate)) return candidate
    // moduleResolution NodeNext: .js imports map to .ts source files
    if (ext === '.js' && base.endsWith('.js')) {
      const tsVersion = base.slice(0, -3) + '.ts'
      if (trackedSet.has(tsVersion)) return tsVersion
      const tsxVersion = base.slice(0, -3) + '.tsx'
      if (trackedSet.has(tsxVersion)) return tsxVersion
    }
  }

  // Try index files (barrel resolution)
  for (const ext of JS_TS_EXTS) {
    const candidate = base + '/index' + ext
    if (trackedSet.has(candidate)) return candidate
  }

  return null
}

/**
 * Extract relative import specifiers from JS/TS content.
 */
function extractJsTsSpecifiers(content: string): string[] {
  const specifiers: string[] = []
  for (const re of [RELATIVE_FROM_RE, RELATIVE_REQUIRE_RE, RELATIVE_DYNAMIC_RE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) specifiers.push(m[1])
  }
  return specifiers
}

/**
 * Extract relative import specifiers from Python content.
 *
 * Two forms:
 *   from .module import X  → edge to pkg/module.py
 *   from . import X, Y     → edges to pkg/X.py and pkg/Y.py
 */
function extractPythonSpecifiers(fromFile: string, content: string): string[] {
  const fromDir = path.dirname(fromFile)
  const specifiers: string[] = []
  let m: RegExpExecArray | null

  // from .module import X  (module part has word chars after dots)
  PYTHON_FROM_MODULE_RE.lastIndex = 0
  while ((m = PYTHON_FROM_MODULE_RE.exec(content)) !== null) {
    const dotted = m[1]
    const dots = dotted.match(/^\.+/)?.[0] ?? '.'
    const modulePart = dotted.slice(dots.length).replace(/\./g, '/')
    let base = fromDir
    for (let k = 1; k < dots.length; k++) base = path.dirname(base)
    specifiers.push(path.join(base, modulePart).replace(/\\/g, '/'))
  }

  // from . import X, Y  (names are the modules in the current/parent package)
  PYTHON_FROM_PACKAGE_RE.lastIndex = 0
  while ((m = PYTHON_FROM_PACKAGE_RE.exec(content)) !== null) {
    const dots = m[1]
    const namesPart = m[2]
    let base = fromDir
    for (let k = 1; k < dots.length; k++) base = path.dirname(base)
    const names = namesPart
      .replace(/[()]/g, '')
      .split(',')
      .map(n => n.trim().split(/\s+as\s+/)[0].trim())
      .filter(n => n.length > 0 && /^[a-zA-Z_]/.test(n))
    for (const name of names) {
      specifiers.push(path.join(base, name).replace(/\\/g, '/'))
    }
  }

  return specifiers
}

/**
 * Normalize a cycle by rotating to its lexicographically smallest member.
 * This ensures the same cycle is not reported multiple times.
 */
function normalizeCycle(cycle: string[]): string {
  let minIdx = 0
  for (let k = 1; k < cycle.length; k++) {
    if (cycle[k] < cycle[minIdx]) minIdx = k
  }
  const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)]
  return rotated.join('\0')
}

/**
 * DFS-based cycle detection. Returns sets of files involved in cycles.
 */
function detectCycles(graph: Map<string, string[]>): string[][] {
  const visited = new Set<string>()
  const onStack = new Set<string>()
  const seenCycles = new Set<string>()
  const results: string[][] = []

  function dfs(node: string, pathStack: string[]): void {
    if (pathStack.length > MAX_PATH_DEPTH) return
    if (onStack.has(node)) {
      // Found a cycle — extract the portion from where node first appears
      const cycleStart = pathStack.indexOf(node)
      if (cycleStart !== -1) {
        const cycle = pathStack.slice(cycleStart)
        const key = normalizeCycle(cycle)
        if (!seenCycles.has(key)) {
          seenCycles.add(key)
          results.push(cycle)
        }
      }
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    onStack.add(node)
    pathStack.push(node)

    for (const neighbor of graph.get(node) ?? []) {
      dfs(neighbor, pathStack)
    }

    pathStack.pop()
    onStack.delete(node)
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node, [])
  }

  return results
}

export const isoMai001: Rule = {
  id: 'ISO-MAI001',
  description:
    'Circular import detected between modules (ISO 5055 Maintainability). ' +
    'Supports JS/TS relative imports and Python relative imports.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    let trackedFiles: string[]
    try {
      trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
        .split('\n')
        .filter(Boolean)
    } catch {
      return []
    }

    const trackedSet = new Set(trackedFiles)
    const graph = new Map<string, string[]>()

    for (const relPath of trackedFiles) {
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const ext = path.extname(relPath)
      const isJsTs = JS_TS_EXT_SET.has(ext)
      const isPython = PYTHON_EXT_SET.has(ext)

      if (!isJsTs && !isPython) continue

      let content: string
      try {
        content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8')
      } catch { continue }

      const specifiers = isJsTs
        ? extractJsTsSpecifiers(content)
        : extractPythonSpecifiers(relPath, content)

      const edges: string[] = []
      for (const spec of specifiers) {
        const resolved = isJsTs
          ? resolveSpecifier(relPath, spec, trackedSet)
          : (trackedSet.has(spec + '.py') ? spec + '.py' : trackedSet.has(spec) ? spec : null)
        if (resolved && resolved !== relPath) edges.push(resolved)
      }

      graph.set(relPath, edges)
    }

    const cycles = detectCycles(graph)
    const findings: Finding[] = []

    for (const cycle of cycles) {
      const cycleDisplay = [...cycle, cycle[0]].join(' → ')
      for (const file of cycle) {
        if (isExcluded(file, ctx.config.exclude)) continue
        findings.push({
          ruleId: 'ISO-MAI001',
          severity: 'error',
          file,
          message: `Circular import detected: ${cycleDisplay}`,
          fix: 'Extract shared logic into a separate module that neither participant imports.',
        })
      }
    }

    return findings
  },
}