import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caPkg001 } from '../../src/rules/ca-pkg001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-pkg001-'))
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
    config: { exclude: [], rules: { 'CA-PKG001': { severity: 'error' } } },
  }
}

describe('CA-PKG001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds no finding when referenced local file exists', async () => {
    writeFile(tmpDir, 'dist/index.js', 'console.log("hello")')
    writeFile(tmpDir, 'package.json', JSON.stringify({
      scripts: { start: 'node ./dist/index.js' },
    }, null, 2))
    const findings = await caPkg001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('finds a finding when node ./dist/index.js is missing', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({
      scripts: { start: 'node ./dist/index.js' },
    }, null, 2))
    const findings = await caPkg001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-PKG001')
    expect(findings[0].message).toContain('./dist/index.js')
    expect(findings[0].file).toBe('package.json')
  })

  it('finds no finding for scripts with no local file reference', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({
      scripts: { test: 'vitest run', lint: 'eslint .' },
    }, null, 2))
    const findings = await caPkg001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('handles ts-node and tsx runners', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({
      scripts: { dev: 'ts-node ./src/server.ts' },
    }, null, 2))
    const findings = await caPkg001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('./src/server.ts')
  })

  it('returns no findings when package.json is missing', async () => {
    const findings = await caPkg001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('returns no findings when package.json has no scripts field', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'foo' }))
    const findings = await caPkg001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('reports the correct line number', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({
      scripts: {
        build: 'tsc',
        start: 'node ./dist/index.js',
      },
    }, null, 2))
    const findings = await caPkg001.run(makeCtx(tmpDir))
    expect(findings[0].line).toBeGreaterThan(0)
  })
})
