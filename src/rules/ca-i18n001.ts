import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

// Common locale directory names
const LOCALE_DIRS = ['locales', 'i18n', 'src/locales', 'public/locales', 'src/i18n', 'assets/i18n']
// Top-level locale file names to check
const LOCALE_FILENAMES = ['en.json', 'messages.json', 'translations.json', 'strings.json']
// Source file extensions to scan
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'])
// Directories to skip during source walk
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.nuxt', 'out', 'coverage', '.git'])

interface I18nDetector { name: string; pattern: RegExp }

// Each pattern captures exactly one group: the static translation key
const DETECTORS: I18nDetector[] = [
  { name: 'react-i18next/i18next t()',   pattern: /\bt\(\s*['"]([^'"]+)['"]\s*[,)]/g },
  { name: 'vue-i18n $t()',               pattern: /\$t\(\s*['"]([^'"]+)['"]\s*[,)]/g },
  { name: 'i18n.t()',                    pattern: /\bi18n\.t\(\s*['"]([^'"]+)['"]\s*[,)]/g },
  { name: 'react-intl formatMessage id', pattern: /formatMessage\(\s*\{\s*id\s*:\s*['"]([^'"]+)['"]/g },
  { name: 'intl.formatMessage id',       pattern: /intl\.formatMessage\(\s*\{\s*id\s*:\s*['"]([^'"]+)['"]/g },
]

function flattenLocaleKeys(obj: unknown, prefix: string, keys: Set<string>): void {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${k}` : k
    keys.add(full)
    flattenLocaleKeys(v, full, keys)
  }
}

function walkJsonFiles(dir: string, root: string, keys: Set<string>, sources: string[]): void {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkJsonFiles(full, root, keys, sources)
      } else if (entry.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(fs.readFileSync(full, 'utf-8'))
          flattenLocaleKeys(parsed, '', keys)
          sources.push(path.relative(root, full))
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

function collectLocaleKeys(root: string): { keys: Set<string>; sources: string[] } {
  const keys = new Set<string>()
  const sources: string[] = []
  for (const name of LOCALE_FILENAMES) {
    const p = path.join(root, name)
    if (fs.existsSync(p)) {
      try {
        flattenLocaleKeys(JSON.parse(fs.readFileSync(p, 'utf-8')), '', keys)
        sources.push(name)
      } catch { /* ignore */ }
    }
  }
  for (const dir of LOCALE_DIRS) {
    const absDir = path.join(root, dir)
    if (fs.existsSync(absDir)) walkJsonFiles(absDir, root, keys, sources)
  }
  return { keys, sources }
}

function walkSourceFiles(dir: string, results: string[]): void {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walkSourceFiles(path.join(dir, entry.name), results)
      } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
        results.push(path.join(dir, entry.name))
      }
    }
  } catch { /* ignore */ }
}

export const caI18n001: Rule = {
  id: 'CA-I18N001',
  description: 'A static i18n key used in code is not present in any locale file. (JS/TS/Vue/Svelte — add entries to DETECTORS array to support other languages.)',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr', 'staged'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    // Guard: JS/TS projects only
    if (!fs.existsSync(path.join(ctx.repoRoot, 'package.json'))) return []

    const { keys: localeKeys, sources } = collectLocaleKeys(ctx.repoRoot)
    if (localeKeys.size === 0) return [] // No locale files — skip entirely

    let filesToScan: string[]
    if (ctx.mode === 'staged' && ctx.stagedDiffs) {
      filesToScan = ctx.stagedDiffs
        .filter(d => d.status !== 'deleted')
        .map(d => path.join(ctx.repoRoot, d.path))
        .filter(p => SOURCE_EXTS.has(path.extname(p)))
    } else {
      filesToScan = []
      walkSourceFiles(ctx.repoRoot, filesToScan)
    }

    const findings: Finding[] = []
    const sourceSet = new Set(sources)

    for (const absPath of filesToScan) {
      const relPath = path.relative(ctx.repoRoot, absPath)
      if (isExcluded(relPath, ctx.config.exclude)) continue
      if (sourceSet.has(relPath)) continue // Don't scan locale files themselves

      let content: string
      try { content = fs.readFileSync(absPath, 'utf-8') } catch { continue }

      const seenInFile = new Set<string>()

      for (const detector of DETECTORS) {
        detector.pattern.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = detector.pattern.exec(content)) !== null) {
          const key = m[1]
          if (seenInFile.has(key)) continue
          seenInFile.add(key)
          if (!localeKeys.has(key)) {
            const lineNum = content.slice(0, m.index).split('\n').length
            findings.push({
              ruleId: 'CA-I18N001',
              severity: 'error',
              file: relPath,
              line: lineNum,
              message: `i18n key "${key}" is not found in any locale file.`,
              detail: `Checked: ${sources.slice(0, 5).join(', ')}${sources.length > 5 ? ` (+${sources.length - 5} more)` : ''}`,
              fix: `Add "${key}" to your locale files.`,
            })
          }
        }
      }
    }

    return findings
  },
}
