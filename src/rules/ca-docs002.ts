import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

function walkDocFiles(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkDocFiles(full, results)
    else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) results.push(full)
  }
}

function findDocFiles(root: string): string[] {
  const files: string[] = []
  for (const name of ['README.md', 'CONTRIBUTING.md']) {
    const p = path.join(root, name)
    if (fs.existsSync(p)) files.push(p)
  }
  walkDocFiles(path.join(root, 'docs'), files)
  return files
}

interface LinkRef { target: string; line: number }

function extractLocalLinks(content: string): LinkRef[] {
  const refs: LinkRef[] = []
  // Match [text](./path) and [text](../path) — relative only, skip https://
  const pattern = /\[[^\]]*\]\((\.{1,2}\/[^)]*)\)/g
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(lines[i])) !== null) {
      let target = m[1]
      // Strip #anchor fragment before checking existence
      const hashIdx = target.indexOf('#')
      if (hashIdx !== -1) target = target.slice(0, hashIdx)
      if (target) refs.push({ target, line: i + 1 })
    }
  }
  return refs
}

export const caDocs002: Rule = {
  id: 'CA-DOCS002',
  description: 'README or docs contain a broken relative Markdown link.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []
    for (const docFile of findDocFiles(ctx.repoRoot)) {
      const relPath = path.relative(ctx.repoRoot, docFile)
      if (isExcluded(relPath, ctx.config.exclude)) continue
      const content = fs.readFileSync(docFile, 'utf-8')
      const docDir = path.dirname(docFile)
      for (const { target, line } of extractLocalLinks(content)) {
        const resolved = path.resolve(docDir, target)
        if (!fs.existsSync(resolved)) {
          findings.push({
            ruleId: 'CA-DOCS002',
            severity: 'error',
            file: relPath,
            line,
            message: `Broken local link: "${target}" does not exist.`,
          })
        }
      }
    }
    return findings
  },
}
