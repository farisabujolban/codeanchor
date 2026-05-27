import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

// Well-known root-level filenames worth checking even without a slash
const ROOT_FILES = new Set([
  'Dockerfile', 'Makefile', '.env', '.env.example',
  'package.json', 'tsconfig.json', 'jest.config.js', 'vite.config.ts',
  '.eslintrc.js', '.eslintrc.json', '.prettierrc',
])

// Match backtick-enclosed tokens that look like local file paths.
// A candidate must either contain a forward slash or be a known root filename.
// We exclude: URLs, npm scoped packages (@foo/bar), flags (-flag), shell
// variables ($VAR), and anything with spaces.
const BACKTICK_RE = /`([^`\s]+)`/g

function isLocalPathCandidate(token: string): boolean {
  // Strip :line and #anchor suffixes before deciding
  const stripped = stripSuffix(token)
  if (!stripped) return false
  if (stripped.startsWith('http://') || stripped.startsWith('https://')) return false
  if (stripped.startsWith('@')) return false   // npm scoped package
  if (stripped.startsWith('-')) return false   // CLI flag
  if (stripped.startsWith('$')) return false   // shell variable
  if (stripped.includes(' ')) return false
  // Must contain a slash OR be a known root filename
  if (stripped.includes('/')) return true
  return ROOT_FILES.has(stripped)
}

function stripSuffix(token: string): string {
  // Remove :12 line suffix
  let t = token.replace(/:\d+$/, '')
  // Remove #anchor suffix
  const hash = t.indexOf('#')
  if (hash !== -1) t = t.slice(0, hash)
  return t
}

function walkMd(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(full, results)
    else if (entry.name.endsWith('.md')) results.push(full)
  }
}

function findDocFiles(root: string): string[] {
  const files: string[] = []
  const readme = path.join(root, 'README.md')
  if (fs.existsSync(readme)) files.push(readme)
  walkMd(path.join(root, 'docs'), files)
  return files
}

interface PathRef { rawToken: string; resolvedPath: string; line: number }

function extractPathRefs(content: string): PathRef[] {
  const refs: PathRef[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    BACKTICK_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = BACKTICK_RE.exec(lines[i])) !== null) {
      const token = m[1]
      if (!isLocalPathCandidate(token)) continue
      refs.push({ rawToken: token, resolvedPath: stripSuffix(token), line: i + 1 })
    }
  }
  return refs
}

export const caDocs003: Rule = {
  id: 'CA-DOCS003',
  description: 'README or docs mention a backtick-enclosed local path that does not exist.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    for (const docFile of findDocFiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, docFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const content = fs.readFileSync(docFile, 'utf-8')
      for (const { rawToken, resolvedPath, line } of extractPathRefs(content)) {
        const abs = path.resolve(ctx.repoRoot, resolvedPath)
        if (!fs.existsSync(abs)) {
          findings.push({
            ruleId: 'CA-DOCS003',
            severity: 'warn',
            file: relPath,
            line,
            message: `Docs mention \`${rawToken}\` but "${resolvedPath}" does not exist.`,
          })
        }
      }
    }

    return findings
  },
}
