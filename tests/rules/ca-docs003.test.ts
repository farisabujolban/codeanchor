import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caDocs003 } from '../../src/rules/ca-docs003.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docs003-'))
}

function writeFile(dir: string, name: string, content: string): void {
  const full = path.join(dir, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

function makeCtx(tmpDir: string): RuleContext {
  return {
    mode: 'repo',
    repoRoot: tmpDir,
    config: { exclude: [], rules: { 'CA-DOCS003': { severity: 'warn' } } },
  }
}

describe('CA-DOCS003', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds no finding when mentioned path exists', async () => {
    writeFile(tmpDir, 'src/api.ts', '')
    writeFile(tmpDir, 'README.md', 'See `src/api.ts` for details.')
    expect(await caDocs003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding when mentioned path is missing', async () => {
    writeFile(tmpDir, 'README.md', 'See `src/api.ts` for details.')
    const findings = await caDocs003.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-DOCS003')
    expect(findings[0].message).toContain('src/api.ts')
  })

  it('ignores URLs in backticks', async () => {
    writeFile(tmpDir, 'README.md', 'See `https://example.com/docs`.')
    expect(await caDocs003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('ignores npm scoped packages in backticks', async () => {
    writeFile(tmpDir, 'README.md', 'Install `@foo/bar` first.')
    expect(await caDocs003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('ignores CLI flags in backticks', async () => {
    writeFile(tmpDir, 'README.md', 'Use `--staged` flag.')
    expect(await caDocs003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('ignores plain commands without slashes', async () => {
    writeFile(tmpDir, 'README.md', 'Run `git status` to check.')
    expect(await caDocs003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('strips :line suffix before resolving', async () => {
    writeFile(tmpDir, 'src/api.ts', '')
    writeFile(tmpDir, 'README.md', 'See `src/api.ts:42` for the handler.')
    expect(await caDocs003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding for .github/workflows/ci.yml that is missing', async () => {
    writeFile(tmpDir, 'README.md', 'CI runs via `.github/workflows/ci.yml`.')
    const findings = await caDocs003.run(makeCtx(tmpDir))
    expect(findings.some(f => f.message.includes('.github/workflows/ci.yml'))).toBe(true)
  })

  it('scans docs/ subdirectory', async () => {
    writeFile(tmpDir, 'docs/SETUP.md', 'Use `scripts/bootstrap.sh` to set up.')
    const findings = await caDocs003.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('docs/SETUP.md')
  })

  it('respects excluded doc files', async () => {
    writeFile(tmpDir, 'README.md', 'See `src/missing.ts`.')
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: ['README.md'], rules: {} },
    }
    expect(await caDocs003.run(ctx)).toHaveLength(0)
  })

  it('reports the correct line number', async () => {
    writeFile(tmpDir, 'README.md', '# Title\n\nSee `src/missing.ts` for details.')
    const findings = await caDocs003.run(makeCtx(tmpDir))
    expect(findings[0].line).toBe(3)
  })
})
