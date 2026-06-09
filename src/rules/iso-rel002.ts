import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const PYTHON_EXTS = new Set(['.py'])
const JAVA_EXTS = new Set(['.java'])

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Replace comments and string literals with spaces, preserving newlines so
// that character-position → line-number mapping stays accurate.
function sanitize(s: string): string {
  let r = s
  // C-style block comments: /* ... */
  r = r.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  // C-style line comments: // ...
  r = r.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
  // Python # comments
  r = r.replace(/#[^\n]*/g, m => ' '.repeat(m.length))
  // Template literals (simplified — no nested expressions)
  r = r.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, m => m.replace(/[^\n]/g, ' '))
  // Double-quoted strings (no newlines)
  r = r.replace(/"(?:[^"\\]|\\.)*"/g, m => '"'.repeat(m.length))
  // Single-quoted strings (no newlines)
  r = r.replace(/'(?:[^'\\]|\\.)*'/g, m => "'".repeat(m.length))
  return r
}

// Find the opening { for a function body, scanning forward from searchFrom.
// Tracks () and [] depth to skip past parameter lists and type annotations.
// Returns the position of { at depth 0, or -1 if a ; is encountered first
// or the search limit is exceeded.
function findBodyOpen(content: string, searchFrom: number): number {
  let depth = 0
  const limit = Math.min(searchFrom + 1200, content.length)
  for (let i = searchFrom; i < limit; i++) {
    const ch = content[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === '{' && depth === 0) return i
    else if (ch === ';' && depth === 0) return -1
  }
  return -1
}

// Find matching closing } for the { at openPos. Returns -1 if unmatched.
function findBodyClose(content: string, openPos: number): number {
  let depth = 1
  let i = openPos + 1
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++
    else if (content[i] === '}') depth--
    i++
  }
  return depth === 0 ? i - 1 : -1
}

// Get 1-based line number for a character offset.
function lineAt(content: string, pos: number): number {
  let line = 1
  for (let i = 0; i < pos; i++) if (content[i] === '\n') line++
  return line
}

// Escape a string for use in a RegExp.
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// JS/TS function extraction
// ---------------------------------------------------------------------------

interface FuncDef {
  name: string
  bodyStart: number  // position of opening {
  bodyEnd: number    // position of closing }
}

function extractJsTsFunctions(san: string): FuncDef[] {
  const results: FuncDef[] = []

  // 1. Named function declarations:
  //    [export] [default] [async] function [*] name<...>(...)...{
  const DECL_RE = /\bfunction\s*\*?\s+([a-zA-Z_$][\w$]*)\b/g
  let m: RegExpExecArray | null
  DECL_RE.lastIndex = 0
  while ((m = DECL_RE.exec(san)) !== null) {
    const bodyOpen = findBodyOpen(san, m.index + m[0].length)
    if (bodyOpen === -1) continue
    const bodyClose = findBodyClose(san, bodyOpen)
    if (bodyClose === -1) continue
    results.push({ name: m[1], bodyStart: bodyOpen, bodyEnd: bodyClose })
  }

  // 2. Arrow/function expressions:
  //    const/let/var name [: type] = [async] ( function | (params) => ) ... {
  //    We look for: const/let/var NAME, then confirm it's followed by = and
  //    a function/arrow introducer within the next 500 chars.
  const EXPR_RE = /\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\b/g
  EXPR_RE.lastIndex = 0
  while ((m = EXPR_RE.exec(san)) !== null) {
    const name = m[1]
    // Look ahead to verify this is actually assigned to a function/arrow
    const ahead = san.slice(m.index + m[0].length, m.index + m[0].length + 500)
    // Must see = then async? then (function | ( | identifier =>)
    if (!/=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?:[^{;=\n]*)?\s*=>|\w+\s*=>)/.test(ahead)) continue
    // Find the body opening { starting just after the variable name
    const bodyOpen = findBodyOpen(san, m.index + m[0].length)
    if (bodyOpen === -1) continue
    const bodyClose = findBodyClose(san, bodyOpen)
    if (bodyClose === -1) continue
    results.push({ name, bodyStart: bodyOpen, bodyEnd: bodyClose })
  }

  return results
}

// Search for a direct recursive call (funcName followed by '(' not preceded by '.')
// within the extracted body. Returns the line number of the first match, or null.
function findRecursiveCall(san: string, func: FuncDef): number | null {
  const body = san.slice(func.bodyStart + 1, func.bodyEnd)
  const callRe = new RegExp(`(?<!\\.)\\b${escRe(func.name)}\\s*\\(`, 'g')
  callRe.lastIndex = 0
  const m = callRe.exec(body)
  if (!m) return null
  return lineAt(san, func.bodyStart + 1 + m.index)
}

// ---------------------------------------------------------------------------
// Python function extraction
// ---------------------------------------------------------------------------

interface PyFuncDef {
  name: string
  indent: number   // indent level of the `def` line
  startLine: number  // 1-based line of the `def` keyword
  bodyLines: string[]  // body lines (after the def line)
}

function extractPythonFunctions(content: string): PyFuncDef[] {
  const results: PyFuncDef[] = []
  const lines = content.split('\n')
  const DEF_RE = /^(\s*)def\s+([a-zA-Z_][\w]*)\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const m = DEF_RE.exec(lines[i])
    if (!m) continue

    const indent = m[1].length
    const name = m[2]

    // Collect body lines: those indented strictly more than the def line
    const bodyLines: string[] = []
    let j = i + 1
    while (j < lines.length) {
      const l = lines[j]
      const trimmed = l.trim()
      if (trimmed.length === 0) { bodyLines.push(l); j++; continue }
      if (trimmed.startsWith('#')) { bodyLines.push(l); j++; continue }
      const lineIndent = l.length - l.trimStart().length
      if (lineIndent > indent) { bodyLines.push(l); j++ }
      else break
    }

    results.push({ name, indent, startLine: i + 1, bodyLines })
    i = j - 1  // skip to after the body on next iteration
  }

  return results
}

function findPythonRecursiveCall(func: PyFuncDef): number | null {
  const callRe = new RegExp(`(?<!\\.)\\b${escRe(func.name)}\\s*\\(`, 'g')

  // Find start line of body (first non-blank, non-comment line after def)
  // We need the actual line number in the file, not the bodyLines array index.
  // func.startLine is the def line; body starts at func.startLine + 1 (approx).
  // We'll track line numbers as we scan.
  let lineOffset = func.startLine + 1  // first body line number (1-based)
  for (let i = 0; i < func.bodyLines.length; i++) {
    callRe.lastIndex = 0
    if (callRe.test(func.bodyLines[i])) return lineOffset + i
  }
  return null
}

// ---------------------------------------------------------------------------
// Java method extraction
// ---------------------------------------------------------------------------

function extractJavaMethods(san: string): FuncDef[] {
  const results: FuncDef[] = []

  // Method declarations: require at least one access/modifier keyword before name
  // public/private/protected/static/final/synchronized/abstract
  // Followed by return type(s) and then methodName(
  const METHOD_RE =
    /\b(?:(?:public|private|protected|static|final|synchronized|abstract)\s+)+(?:[\w<>\[\]]+\s+)+([a-zA-Z_$][\w$]*)\s*\(/g

  let m: RegExpExecArray | null
  METHOD_RE.lastIndex = 0
  while ((m = METHOD_RE.exec(san)) !== null) {
    const name = m[1]

    // Skip Java keywords that might match the pattern
    if (/^(?:if|for|while|switch|catch|return|new|throw|class|interface|enum)$/.test(name)) continue

    const bodyOpen = findBodyOpen(san, m.index + m[0].length - 1)
    if (bodyOpen === -1) continue
    const bodyClose = findBodyClose(san, bodyOpen)
    if (bodyClose === -1) continue
    results.push({ name, bodyStart: bodyOpen, bodyEnd: bodyClose })
  }

  return results
}

// ---------------------------------------------------------------------------
// Rule definition
// ---------------------------------------------------------------------------

export const isoRel002: Rule = {
  id: 'ISO-REL002',
  description:
    'Direct recursive function call detected (MISRA-C:2012 Rule 17.2 spirit, ISO 26262 Part 6). ' +
    'Recursion can cause unbounded stack growth and is prohibited in safety-critical code. ' +
    'Applies to named function declarations and expressions (JS/TS), def functions (Python), ' +
    'and methods (Java). Note: expression-body arrow functions and indirect recursion are not detected.',
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
      const isJsTs = JS_TS_EXTS.has(ext)
      const isPython = PYTHON_EXTS.has(ext)
      const isJava = JAVA_EXTS.has(ext)

      if (!isJsTs && !isPython && !isJava) continue

      let content: string
      try {
        content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8')
      } catch { continue }

      if (isPython) {
        const funcs = extractPythonFunctions(content)
        for (const func of funcs) {
          const callLine = findPythonRecursiveCall(func)
          if (callLine !== null) {
            findings.push({
              ruleId: 'ISO-REL002',
              severity: 'warn',
              file: relPath,
              line: callLine,
              message:
                `Function \`${func.name}\` calls itself recursively (MISRA-C Rule 17.2 spirit). ` +
                'Direct recursion can cause stack overflow and is prohibited in safety-critical code.',
              fix: 'Refactor using an explicit stack/queue (iterative approach) to eliminate recursion.',
            })
          }
        }
        continue
      }

      const san = sanitize(content)

      const funcs = isJsTs
        ? extractJsTsFunctions(san)
        : extractJavaMethods(san)

      for (const func of funcs) {
        const callLine = findRecursiveCall(san, func)
        if (callLine !== null) {
          findings.push({
            ruleId: 'ISO-REL002',
            severity: 'warn',
            file: relPath,
            line: callLine,
            message:
              `Function/method \`${func.name}\` calls itself recursively (MISRA-C Rule 17.2 spirit). ` +
              'Direct recursion can cause stack overflow and is prohibited in safety-critical code.',
            fix: 'Refactor using an explicit stack/queue (iterative approach) to eliminate recursion.',
          })
        }
      }
    }

    return findings
  },
}
