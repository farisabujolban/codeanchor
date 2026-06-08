import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

// Match filenames where "plan" or "planning" appears as a whole word
// (preceded/followed by start-of-name, dash, underscore, dot, or end-of-name).
const PLAN_FILENAME_RE = /(?:^|[-_.])(plans?|planning)(?:[-_.]|$)/i

function walkMd(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(full, results)
    else if (entry.name.endsWith('.md') && PLAN_FILENAME_RE.test(entry.name)) {
      results.push(full)
    }
  }
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  if (!content.startsWith('---')) return null
  const end = content.indexOf('\n---', 3)
  if (end === -1) return null
  const block = content.slice(4, end)
  try {
    const parsed = yaml.load(block)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch { /* malformed frontmatter */ }
  return null
}

const DETAIL = 'Add a YAML frontmatter block at the top of the file:\n---\nmodel: <model-id>\nintelligence: <level>\n---'

export const caPlan001: Rule = {
  id: 'CA-PLAN001',
  description: 'Plan file is missing required AI model or intelligence level in YAML frontmatter.',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'staged', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const planFiles: string[] = []
    walkMd(ctx.repoRoot, planFiles)

    const findings: Finding[] = []
    for (const file of planFiles) {
      const relPath = path.relative(ctx.repoRoot, file)
      if (isExcluded(relPath, ctx.config.exclude)) continue
      const content = fs.readFileSync(file, 'utf-8')
      const fm = parseFrontmatter(content)
      const model = fm?.['model']
      const intelligence = fm?.['intelligence']
      if (!model || typeof model !== 'string' || model.trim() === '') {
        findings.push({
          ruleId: 'CA-PLAN001',
          severity: 'warn',
          file: relPath,
          message: 'Plan file is missing required frontmatter field "model".',
          detail: DETAIL,
        })
      }
      if (!intelligence || typeof intelligence !== 'string' || intelligence.trim() === '') {
        findings.push({
          ruleId: 'CA-PLAN001',
          severity: 'warn',
          file: relPath,
          message: 'Plan file is missing required frontmatter field "intelligence".',
          detail: DETAIL,
        })
      }
    }
    return findings
  },
}
