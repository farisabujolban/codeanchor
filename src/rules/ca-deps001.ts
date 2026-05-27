import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

interface PackageJson {
  dependencies?: Record<string, string>
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const FROM_RE = /\bfrom\s+['"]([^'"./][^'"]*)['"]/g
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"./][^'"]*)['"]/g
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"./][^'"]*)['"]/g

function isTestFile(filePath: string): boolean {
  const n = filePath.replace(/\\/g, '/')
  return (
    n.includes('.test.') ||
    n.includes('.spec.') ||
    n.includes('/__tests__/') ||
    /\/(test|tests|spec|specs)\//.test(n)
  )
}

function extractPackageNames(content: string): string[] {
  const names = new Set<string>()
  function add(raw: string): void {
    const pkg = raw.startsWith('@') ? raw.split('/').slice(0, 2).join('/') : raw.split('/')[0]
    names.add(pkg)
  }
  for (const re of [FROM_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) add(m[1])
  }
  return [...names]
}

export const caDeps001: Rule = {
  id: 'CA-DEPS001',
  description: 'Production dependency is only imported in test files — should be in devDependencies.',
  defaultSeverity: 'warn',
  applicableModes: ['repo'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const pkgPath = path.join(ctx.repoRoot, 'package.json')
    if (!fs.existsSync(pkgPath)) return []

    let pkg: PackageJson
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson
    } catch { return [] }

    const prodDeps = new Set(Object.keys(pkg.dependencies ?? {}))
    if (prodDeps.size === 0) return []

    let trackedFiles: string[]
    try {
      trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
        .split('\n').filter(Boolean)
    } catch { return [] }

    // true = only seen in test files so far; false = seen in non-test file
    const usageMap = new Map<string, boolean>()

    for (const filePath of trackedFiles) {
      if (isExcluded(filePath, ctx.config.exclude)) continue
      if (!SOURCE_EXTS.has(path.extname(filePath))) continue

      let content: string
      try {
        content = fs.readFileSync(path.join(ctx.repoRoot, filePath), 'utf-8')
      } catch { continue }

      const inTest = isTestFile(filePath)
      for (const pkg of extractPackageNames(content)) {
        if (!prodDeps.has(pkg)) continue
        if (!inTest) {
          usageMap.set(pkg, false)       // seen in prod code — not test-only
        } else if (!usageMap.has(pkg)) {
          usageMap.set(pkg, true)        // first sighting, in a test file
        }
        // if already false, leave it
      }
    }

    const findings: Finding[] = []
    for (const [dep, testOnly] of usageMap) {
      if (testOnly) {
        findings.push({
          ruleId: 'CA-DEPS001',
          severity: 'warn',
          file: 'package.json',
          message: `"${dep}" is in dependencies but only imported in test files — move it to devDependencies.`,
        })
      }
    }
    return findings
  },
}