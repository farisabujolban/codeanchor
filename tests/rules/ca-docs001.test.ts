import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caDocs001 } from '../../src/rules/ca-docs001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docs001-'))
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
    config: { exclude: [], rules: { 'CA-DOCS001': { severity: 'error' } } },
  }
}

describe('CA-DOCS001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds no finding when npm run build exists in package.json', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc', test: 'vitest' } }))
    writeFile(tmpDir, 'README.md', 'Run `npm run build` to compile.')
    const findings = await caDocs001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('finds a finding when npm run deploy is missing from package.json', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc', test: 'vitest' } }))
    writeFile(tmpDir, 'README.md', 'Deploy with `npm run deploy`.')
    const findings = await caDocs001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-DOCS001')
    expect(findings[0].file).toBe('README.md')
    expect(findings[0].message).toContain('"deploy"')
  })

  it('finds no finding when yarn test exists', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { test: 'vitest' } }))
    writeFile(tmpDir, 'README.md', 'Run tests with `yarn test`.')
    const findings = await caDocs001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('finds a finding when pnpm run lint is missing', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'README.md', 'Lint with `pnpm run lint`.')
    const findings = await caDocs001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('"lint"')
  })

  it('returns no findings when package.json is missing', async () => {
    writeFile(tmpDir, 'README.md', 'Run `npm run build`.')
    const findings = await caDocs001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('scans docs/ markdown files in addition to README', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'README.md', 'See docs.')
    writeFile(tmpDir, 'docs/SETUP.md', 'Run `npm run deploy` first.')
    const findings = await caDocs001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('docs/SETUP.md')
  })

  it('reports the correct line number', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'README.md', '# Title\n\nRun `npm run missing` here.')
    const findings = await caDocs001.run(makeCtx(tmpDir))
    expect(findings[0].line).toBe(3)
  })
})
