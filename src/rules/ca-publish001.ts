import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { stripJsoncComments } from '../util/jsonc.js'

const SAFE_ENV_SUFFIXES = ['.example', '.sample', '.template', '.test']

function isDangerousEnvFile(base: string): boolean {
  if (!base.startsWith('.env')) return false
  return !SAFE_ENV_SUFFIXES.some(s => base.endsWith(s))
}

function readNpmIgnorePatterns(root: string): string[] {
  const p = path.join(root, '.npmignore')
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean)
}

function npmIgnoreExcludes(patterns: string[], target: string): boolean {
  return patterns.some(p => {
    if (p.startsWith('#')) return false
    // Normalize: *.map, **/*.map, dist/*.map all block map files
    const re = p
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
    try { return new RegExp(re).test(target) } catch { return false }
  })
}

interface TsCompilerOptions {
  sourceMap?: boolean
  declarationMap?: boolean
  outDir?: string
}
interface TsConfig { compilerOptions?: TsCompilerOptions }

interface PackageJson {
  files?: string[]
  private?: boolean
}

export const caPublish001: Rule = {
  id: 'CA-PUBLISH001',
  description: 'npm publish may ship source maps, env files, or all repo files due to missing publish config.',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const pkgPath = path.join(ctx.repoRoot, 'package.json')
    if (!fs.existsSync(pkgPath)) return []

    let pkg: PackageJson
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson
    } catch { return [] }

    // Skip private packages — they can't be published
    if (pkg.private === true) return []

    const findings: Finding[] = []
    const hasFilesField = Array.isArray(pkg.files) && pkg.files.length > 0
    const npmIgnorePatterns = readNpmIgnorePatterns(ctx.repoRoot)
    const hasNpmIgnore = npmIgnorePatterns.length > 0

    // Sub-check 1: publish everything (no files field, no .npmignore)
    if (!hasFilesField && !hasNpmIgnore) {
      findings.push({
        ruleId: 'CA-PUBLISH001',
        severity: 'warn',
        file: 'package.json',
        message:
          'No "files" field and no .npmignore — npm will publish everything not in .gitignore. Add a "files" allowlist or .npmignore to control what ships.',
        fix: 'Add a "files": ["dist"] field to package.json or create a .npmignore.',
      })
    }

    // Sub-check 2: source map leak
    // If tsconfig has sourceMap/declarationMap enabled and maps aren't excluded
    const tsconfigFiles: string[] = []
    try {
      for (const entry of fs.readdirSync(ctx.repoRoot, { withFileTypes: true })) {
        if (
          entry.isFile() &&
          (entry.name === 'tsconfig.json' || /^tsconfig\..+\.json$/.test(entry.name))
        ) {
          tsconfigFiles.push(path.join(ctx.repoRoot, entry.name))
        }
      }
    } catch { /* ignore */ }

    for (const tscPath of tsconfigFiles) {
      let tsc: TsConfig
      try {
        tsc = JSON.parse(stripJsoncComments(fs.readFileSync(tscPath, 'utf-8'))) as TsConfig
      } catch { continue }

      const opts = tsc.compilerOptions ?? {}
      const hasSourceMap = opts.sourceMap === true || opts.declarationMap === true
      if (!hasSourceMap) continue

      // Maps are excluded if: files allowlist doesn't include the outDir maps,
      // or .npmignore blocks *.map
      const mapsBlocked =
        npmIgnoreExcludes(npmIgnorePatterns, 'dist/index.js.map') ||
        npmIgnoreExcludes(npmIgnorePatterns, '*.map') ||
        npmIgnoreExcludes(npmIgnorePatterns, '**/*.map')

      if (!hasFilesField && !mapsBlocked) {
        const relTsc = path.relative(ctx.repoRoot, tscPath)
        findings.push({
          ruleId: 'CA-PUBLISH001',
          severity: 'error',
          file: relTsc,
          message: `"sourceMap" or "declarationMap" is enabled in ${relTsc} but *.map files are not excluded from npm publish. This can expose your TypeScript source in the published package.`,
          fix: 'Add "*.map" to .npmignore, or add a "files" allowlist to package.json.',
        })
      }
    }

    // Sub-check 3: env file leak via npm publish
    // Only relevant when there's no files field (allowlist) protecting things
    if (!hasFilesField) {
      let trackedFiles: string[] = []
      try {
        const out = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
        trackedFiles = out.split('\n').map(l => l.trim()).filter(Boolean)
      } catch { /* not a git repo */ }

      for (const file of trackedFiles) {
        const base = path.basename(file)
        if (!isDangerousEnvFile(base)) continue
        const excluded = npmIgnoreExcludes(npmIgnorePatterns, file) ||
          npmIgnoreExcludes(npmIgnorePatterns, base) ||
          npmIgnoreExcludes(npmIgnorePatterns, '.env*') ||
          npmIgnoreExcludes(npmIgnorePatterns, '*.env')
        if (!excluded) {
          findings.push({
            ruleId: 'CA-PUBLISH001',
            severity: 'error',
            file,
            message: `"${file}" is tracked by git and not excluded from npm publish — secrets in this file will be shipped in the package.`,
            fix: `Add "${base}" or ".env*" to .npmignore.`,
          })
        }
      }
    }

    return findings
  },
}
