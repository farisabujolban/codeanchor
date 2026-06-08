import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.nuxt', 'coverage', '.git'])

interface ParamDetector {
  name: string
  // Identifies files using this framework
  fileSignature: RegExp
  // Matches route definition with inline handler — must capture (pathString) as group 1
  routeStartPattern: RegExp
  // Matches param accesses in the handler body — must capture (paramKey) as group 1
  paramAccessPattern: RegExp
  // Extracts path param names from the path string
  extractPathParams(routePath: string): Set<string>
}

function extractColonParams(routePath: string): Set<string> {
  const params = new Set<string>()
  for (const m of routePath.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)) params.add(m[1])
  return params
}

const PARAM_DETECTORS: ParamDetector[] = [
  {
    name: 'express/fastify',
    fileSignature: /\b(?:express|fastify|Router)\b/,
    // Match: .get('/path/:id', async (req, res) => {
    // Captures group 1 = route path string
    routeStartPattern: /\.(?:get|post|put|patch|delete|options)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/gi,
    paramAccessPattern: /req\.params\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    extractPathParams: extractColonParams,
  },
  // Future: Flask (<param> syntax), Gin (c.Param), Django (kwargs)
]

// Extract handler body starting from an opening '{' using brace counting
function extractHandlerBody(content: string, openBraceIdx: number): string {
  let depth = 0
  let i = openBraceIdx
  const MAX_LEN = 100_000
  while (i < content.length && i - openBraceIdx < MAX_LEN) {
    if (content[i] === '{') depth++
    else if (content[i] === '}') {
      depth--
      if (depth === 0) return content.slice(openBraceIdx, i + 1)
    }
    i++
  }
  return content.slice(openBraceIdx, i)
}

function walkSourceFiles(dir: string, results: string[]): void {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walkSourceFiles(path.join(dir, entry.name), results)
      } else if (['.ts', '.js', '.tsx', '.jsx', '.mjs'].includes(path.extname(entry.name))) {
        results.push(path.join(dir, entry.name))
      }
    }
  } catch { /* ignore */ }
}

export const caRoute001: Rule = {
  id: 'CA-ROUTE001',
  description: 'URL path parameter name does not match the req.params key accessed in the inline handler — silent undefined at runtime. (Express/Fastify in v1 — add entries to PARAM_DETECTORS for Flask, Gin, Django etc.)',
  defaultSeverity: 'error',
  applicableModes: ['repo', 'pr', 'staged'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = []

    let filesToScan: string[]
    if (ctx.mode === 'staged' && ctx.stagedDiffs) {
      filesToScan = ctx.stagedDiffs
        .filter(d => d.status !== 'deleted')
        .map(d => path.join(ctx.repoRoot, d.path))
        .filter(p => ['.ts', '.js', '.tsx', '.jsx', '.mjs'].includes(path.extname(p)))
    } else {
      filesToScan = []
      walkSourceFiles(ctx.repoRoot, filesToScan)
    }

    for (const absPath of filesToScan) {
      const relPath = path.relative(ctx.repoRoot, absPath)
      if (isExcluded(relPath, ctx.config.exclude)) continue

      let content: string
      try { content = fs.readFileSync(absPath, 'utf-8') } catch { continue }

      for (const detector of PARAM_DETECTORS) {
        if (!detector.fileSignature.test(content)) continue

        detector.routeStartPattern.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = detector.routeStartPattern.exec(content)) !== null) {
          const routePath = m[1]
          const pathParams = detector.extractPathParams(routePath)
          if (pathParams.size === 0) continue // No path params — skip

          // The handler body opens at the last '{' of the matched text
          const openBraceIdx = m.index + m[0].lastIndexOf('{')
          const handlerBody = extractHandlerBody(content, openBraceIdx)

          detector.paramAccessPattern.lastIndex = 0
          let pm: RegExpExecArray | null
          const reportedInHandler = new Set<string>()

          while ((pm = detector.paramAccessPattern.exec(handlerBody)) !== null) {
            const accessedKey = pm[1]
            if (reportedInHandler.has(accessedKey)) continue
            if (pathParams.has(accessedKey)) continue
            reportedInHandler.add(accessedKey)

            // Calculate line number in the original file
            const lineNum = content.slice(0, openBraceIdx + pm.index).split('\n').length

            findings.push({
              ruleId: 'CA-ROUTE001',
              severity: 'error',
              file: relPath,
              line: lineNum,
              message: `req.params.${accessedKey} is accessed but ":${accessedKey}" is not in route path "${routePath}". Available params: ${[...pathParams].map(p => ':' + p).join(', ')}.`,
              fix: `Rename the route param to ":${accessedKey}" or update the access to req.params.${[...pathParams][0] ?? '?'}.`,
            })
          }
        }
      }
    }

    return findings
  },
}
