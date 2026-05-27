import fs from 'node:fs'
import path from 'node:path'

export interface CodeownersEntry {
  pattern: string
  line: number
}

const CODEOWNERS_CANDIDATES = [
  '.github/CODEOWNERS',
  'CODEOWNERS',
  'docs/CODEOWNERS',
]

export function findCodeownersPath(repoRoot: string): string | null {
  for (const rel of CODEOWNERS_CANDIDATES) {
    const abs = path.join(repoRoot, rel)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

export function loadCodeownersEntries(absPath: string): CodeownersEntry[] {
  const lines = fs.readFileSync(absPath, 'utf-8').split('\n')
  const entries: CodeownersEntry[] = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const pattern = trimmed.split(/\s+/)[0]
    entries.push({ pattern, line: i + 1 })
  }
  return entries
}

// Patterns like * or ** are intentionally broad — skip staleness check on them
export function isTriviallyBroad(pattern: string): boolean {
  const core = pattern.replace(/^\//, '').replace(/\/$/, '')
  return core === '*' || core === '**' || core === ''
}

export function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.startsWith('/')
  let p = anchored ? pattern.slice(1) : pattern

  p = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\x00/g, '.*')

  const src = anchored ? `^${p}(/.*)?$` : `(^|/)${p}(/.*)?$`
  return new RegExp(src)
}

export function isCovered(filePath: string, patterns: string[]): boolean {
  const normalised = filePath.replace(/\\/g, '/')
  return patterns.some(pat => patternToRegex(pat).test(normalised))
}