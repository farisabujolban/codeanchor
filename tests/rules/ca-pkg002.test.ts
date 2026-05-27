import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caPkg002 } from '../../src/rules/ca-pkg002.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-pkg002-'))
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
    config: { exclude: [], rules: { 'CA-PKG002': { severity: 'error' } } },
  }
}

describe('CA-PKG002', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds no finding when main exists', async () => {
    writeFile(tmpDir, 'dist/index.js', '')
    writeFile(tmpDir, 'package.json', JSON.stringify({ main: './dist/index.js' }))
    expect(await caPkg002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding when main is missing', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ main: './dist/index.js' }))
    const findings = await caPkg002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-PKG002')
    expect(findings[0].message).toContain('"main"')
    expect(findings[0].message).toContain('./dist/index.js')
  })

  it('finds a finding when types is missing', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ types: './dist/index.d.ts' }))
    const findings = await caPkg002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('"types"')
  })

  it('finds no finding when types exists', async () => {
    writeFile(tmpDir, 'dist/index.d.ts', '')
    writeFile(tmpDir, 'package.json', JSON.stringify({ types: './dist/index.d.ts' }))
    expect(await caPkg002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding for missing bin entry', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ bin: { mycli: './dist/cli.js' } }))
    const findings = await caPkg002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('bin.mycli')
  })

  it('skips bin string that is not a local path', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ bin: 'dist/cli.js' }))
    // Not a local path (no ./) — skipped
    expect(await caPkg002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding for missing exports string', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ exports: './dist/index.js' }))
    const findings = await caPkg002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('"exports"')
  })

  it('finds findings inside exports object (import/require/types)', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({
      exports: {
        '.': {
          import: './dist/esm/index.js',
          require: './dist/cjs/index.js',
          types: './dist/index.d.ts',
        },
      },
    }))
    const findings = await caPkg002.run(makeCtx(tmpDir))
    expect(findings.length).toBeGreaterThanOrEqual(3)
  })

  it('finds no finding when all exports entries exist', async () => {
    writeFile(tmpDir, 'dist/esm/index.js', '')
    writeFile(tmpDir, 'dist/cjs/index.js', '')
    writeFile(tmpDir, 'dist/index.d.ts', '')
    writeFile(tmpDir, 'package.json', JSON.stringify({
      exports: {
        '.': {
          import: './dist/esm/index.js',
          require: './dist/cjs/index.js',
          types: './dist/index.d.ts',
        },
      },
    }))
    expect(await caPkg002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('returns no findings when package.json is missing', async () => {
    expect(await caPkg002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('returns no findings when package.json is excluded', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ main: './dist/index.js' }))
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: ['package.json'], rules: {} },
    }
    expect(await caPkg002.run(ctx)).toHaveLength(0)
  })
})
