import type { Comment } from '../types.js'
import type { LanguageDriver } from './languages.js'

const LICENSE_PATTERN = /^[\s*/]*\s*(copyright|license|mit|apache|bsd|gpl|mozilla|isc|unlicense)/i
const TODO_ONLY_PATTERN = /^[\s*/]*\s*(TODO|FIXME|HACK|NOTE|XXX)\s*[:\-]?\s*$/i

const CODE_HEURISTIC_PATTERNS = [
  /\bimport\s+.+\s+from\s+['"`]/,
  /\b(?:const|let|var|function|class|return|throw|if|for|while)\b\s*[\w({]/,
  /[;{}]\s*$/,
  /=>/,
  /\w+\s*=\s*(?:new\s+\w|\[|\{|['"`]|\d)/,
  /\w+\.\w+\s*\(/,
]

function stripCommentMarkers(text: string): string {
  return text
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .replace(/^\s*\*\s?/gm, '')
    .replace(/^\/\/\s?/gm, '')
    .replace(/^#\s?/gm, '')
    .trim()
}

function isCommentedOutCode(text: string): boolean {
  const stripped = stripCommentMarkers(text)
  const lines = stripped.split('\n').filter(l => l.trim().length > 0)
  if (lines.length === 0) return false

  const codeLines = lines.filter(line =>
    CODE_HEURISTIC_PATTERNS.some(p => p.test(line)),
  )
  return codeLines.length / lines.length > 0.5
}

export function shouldIgnoreComment(comment: Comment, driver: LanguageDriver): boolean {
  const text = comment.text

  if (driver.directivePatterns.some(p => p.test(text))) return true
  if (LICENSE_PATTERN.test(stripCommentMarkers(text))) return true
  if (TODO_ONLY_PATTERN.test(stripCommentMarkers(text))) return true
  if (isCommentedOutCode(text)) return true

  return false
}
