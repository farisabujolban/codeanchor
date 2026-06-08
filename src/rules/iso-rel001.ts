import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const CSTYLE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.java', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs'])
const PYTHON_EXTS = new Set(['.py'])

// Strip // line comments from a string
function stripLineComments(s: string): string {
  return s.replace(/\/\/[^\n]*/g, '')
}

// Strip /* ... */ block comments (non-greedy, not spanning multiple calls)
function stripBlockComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '')
}

interface EmptyCatch { line: number }

/**
 * Given a line and the index of the `catch` keyword, find the character position
 * of the `{` that opens the catch body on the same line, or -1 if not on this line.
 * Skips past the optional (...) binding to avoid picking up braces from the try block.
 */
function findCatchBraceOnLine(line: string, catchKeywordIdx: number): number {
  let pos = catchKeywordIdx + 5  // skip "catch"
  // skip whitespace
  while (pos < line.length && line[pos] === ' ') pos++
  // skip optional binding (...)
  if (pos < line.length && line[pos] === '(') {
    let depth = 1
    pos++
    while (pos < line.length && depth > 0) {
      if (line[pos] === '(') depth++
      else if (line[pos] === ')') depth--
      pos++
    }
  }
  // skip whitespace
  while (pos < line.length && line[pos] === ' ') pos++
  return pos < line.length && line[pos] === '{' ? pos : -1
}

/**
 * Find all catch blocks that contain no meaningful code.
 * Works on C-style languages (JS/TS/Java/C/C++/C#).
 */
function findEmptyCStyleCatches(content: string): EmptyCatch[] {
  const results: EmptyCatch[] = []
  const lines = content.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    const catchMatch = /\bcatch\b/.exec(line)
    if (!catchMatch) { i++; continue }

    const catchKeywordIdx = catchMatch.index

    // Find the { that belongs to this catch block
    let braceStart = findCatchBraceOnLine(line, catchKeywordIdx)
    let braceStartLine = i

    if (braceStart === -1) {
      // Allman style: brace on the next non-blank line
      for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
        const trimmed = lines[j].trim()
        if (trimmed.startsWith('{')) {
          braceStart = lines[j].indexOf('{')
          braceStartLine = j
          break
        } else if (trimmed.length > 0) {
          break
        }
      }
    }

    if (braceStart === -1) { i++; continue }

    // Collect everything between the opening { and its matching }
    let depth = 1
    const bodyLines: string[] = []
    let j = braceStartLine

    const afterBrace = lines[j].slice(braceStart + 1)
    // Check if body opens and closes on the same line as the brace
    let closedOnSameLine = false
    for (const ch of afterBrace) {
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { closedOnSameLine = true; break } }
    }

    if (closedOnSameLine) {
      // Single-line body — extract the content between { and }
      const closeIdx = afterBrace.indexOf('}')
      const body = afterBrace.slice(0, closeIdx)
      const stripped = stripLineComments(stripBlockComments(body)).trim()
      if (stripped.length === 0) results.push({ line: i + 1 })
      i = j + 1
      continue
    }

    bodyLines.push(afterBrace)
    j++

    while (j < lines.length && depth > 0) {
      const l = lines[j]
      let closed = false
      for (const ch of l) {
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) { closed = true; break }
        }
      }
      if (!closed) {
        bodyLines.push(l)
      } else {
        bodyLines.push(l.slice(0, l.lastIndexOf('}')))
      }
      j++
    }

    const body = bodyLines.join('\n')
    const stripped = stripLineComments(stripBlockComments(body)).trim()
    if (stripped.length === 0) results.push({ line: i + 1 })

    i = j
  }

  return results
}

interface PythonExceptBlock { line: number }

/**
 * Find Python except blocks containing only `pass` (or nothing).
 */
function findEmptyPythonExcepts(content: string): PythonExceptBlock[] {
  const results: PythonExceptBlock[] = []
  const lines = content.split('\n')

  const EXCEPT_RE = /^(\s*)except(\s+[\w.,\s()*]*)?(\s+as\s+\w+)?\s*:/

  for (let i = 0; i < lines.length; i++) {
    const m = EXCEPT_RE.exec(lines[i])
    if (!m) continue

    const exceptIndent = m[1].length
    const exceptLine = i + 1

    // Collect body lines: those indented more than the except line
    const bodyLines: string[] = []
    let j = i + 1
    while (j < lines.length) {
      const l = lines[j]
      const trimmed = l.trim()
      // blank lines are part of the body
      if (trimmed.length === 0) { bodyLines.push(l); j++; continue }
      // comment lines are part of the body
      if (trimmed.startsWith('#')) { bodyLines.push(l); j++; continue }
      // check indentation — body must be indented more than except
      const indent = l.length - l.trimStart().length
      if (indent > exceptIndent) { bodyLines.push(l); j++ }
      else break
    }

    // Body is "empty" if every non-blank, non-comment line is just `pass`
    const meaningful = bodyLines.filter(l => {
      const t = l.trim()
      return t.length > 0 && !t.startsWith('#')
    })

    if (meaningful.length === 0 || meaningful.every(l => l.trim() === 'pass')) {
      results.push({ line: exceptLine })
    }

    i = j - 1  // outer loop will i++ to j
  }

  return results
}

export const isoRel001: Rule = {
  id: 'ISO-REL001',
  description:
    'Empty catch/except block silently swallows exceptions (ISO 5055 Reliability, CWE-390). ' +
    'Applies to JS/TS/Java/C/C++/C# and Python.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr', 'staged'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    let filePaths: string[]

    if (ctx.mode === 'staged' && ctx.stagedDiffs) {
      filePaths = ctx.stagedDiffs
        .filter(d => d.status !== 'deleted')
        .map(d => d.path)
    } else {
      try {
        filePaths = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
          .split('\n')
          .filter(Boolean)
      } catch {
        return []
      }
    }

    const findings: Finding[] = []

    for (const relPath of filePaths) {
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const ext = path.extname(relPath)
      const isCStyle = CSTYLE_EXTS.has(ext)
      const isPython = PYTHON_EXTS.has(ext)

      if (!isCStyle && !isPython) continue

      let content: string
      try {
        content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8')
      } catch { continue }

      const matches = isCStyle
        ? findEmptyCStyleCatches(content)
        : findEmptyPythonExcepts(content)

      for (const { line } of matches) {
        findings.push({
          ruleId: 'ISO-REL001',
          severity: 'warn',
          file: relPath,
          line,
          message:
            'Empty catch block silently swallows exceptions (CWE-390). ' +
            'Add logging, re-throw, or a comment explaining intentional suppression.',
          fix: 'Handle the error: log it, re-throw it, or add a comment if suppression is intentional.',
        })
      }
    }

    return findings
  },
}