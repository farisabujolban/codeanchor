import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const MAKEFILE_NAMES = ['Makefile', 'makefile', 'GNUmakefile']

function findMakefile(root: string): string | null {
  for (const name of MAKEFILE_NAMES) {
    const p = path.join(root, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

interface MakeCall { target: string; line: number }

function parseMakefile(content: string): {
  definedTargets: Set<string>
  makeCalls: MakeCall[]
  hasIncludes: boolean
} {
  const definedTargets = new Set<string>()
  const makeCalls: MakeCall[] = []
  let hasIncludes = false
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (/^-?include\s+/i.test(line.trim())) {
      hasIncludes = true
    }

    // Target definitions: lines at column 0 containing "name:" (not recipe lines starting with tab)
    if (!line.startsWith('\t')) {
      // Extract all target names before the colon, excluding variable assignments (= or :=)
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0 && line[colonIdx + 1] !== '=' && !line.slice(0, colonIdx).includes('=')) {
        const targets = line.slice(0, colonIdx).trim().split(/\s+/)
        for (const t of targets) {
          if (/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/.test(t)) definedTargets.add(t)
        }
      }
    }

    // .PHONY declarations
    const phonyMatch = line.match(/^\.PHONY\s*:\s*(.+)/)
    if (phonyMatch) {
      for (const t of phonyMatch[1].trim().split(/\s+/)) {
        if (t) definedTargets.add(t)
      }
    }

    // $(MAKE) calls — only flag when target is a static identifier (no $ variables)
    const makeCallRe = /\$\(MAKE\)\s+([a-zA-Z0-9_][a-zA-Z0-9_./-]*)/g
    let m: RegExpExecArray | null
    makeCallRe.lastIndex = 0
    while ((m = makeCallRe.exec(line)) !== null) {
      const target = m[1]
      if (!target.includes('$')) {
        makeCalls.push({ target, line: i + 1 })
      }
    }
  }

  return { definedTargets, makeCalls, hasIncludes }
}

export const caMakefile001: Rule = {
  id: 'CA-MAKEFILE001',
  description: 'Makefile calls $(MAKE) with a target name that is not defined in the same file.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const makefilePath = findMakefile(ctx.repoRoot)
    if (!makefilePath) return []

    const relPath = path.relative(ctx.repoRoot, makefilePath)
    if (isExcluded(relPath, ctx.config.exclude)) return []

    let content: string
    try { content = fs.readFileSync(makefilePath, 'utf-8') } catch { return [] }

    const { definedTargets, makeCalls, hasIncludes } = parseMakefile(content)

    // If file includes other Makefiles we cannot resolve all targets — skip to avoid FP
    if (hasIncludes) return []

    const findings: Finding[] = []
    for (const { target, line } of makeCalls) {
      if (!definedTargets.has(target)) {
        findings.push({
          ruleId: 'CA-MAKEFILE001',
          severity: 'error',
          file: relPath,
          line,
          message: `$(MAKE) ${target} — target "${target}" is not defined in this Makefile.`,
          detail: `Defined targets: ${[...definedTargets].slice(0, 10).join(', ')}${definedTargets.size > 10 ? ' ...' : ''}`,
        })
      }
    }

    return findings
  },
}
