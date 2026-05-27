import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caCi003 } from '../../src/rules/ca-ci003.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-ci003-'))
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
    config: { exclude: [], rules: { 'CA-CI003': { severity: 'error' } } },
  }
}

function workflow(body: string): string {
  return `name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${body}`
}

describe('CA-CI003', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a finding when node run script is missing', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow(
      '      - name: Run\n        run: node scripts/build.js\n',
    ))
    const findings = await caCi003.run(makeCtx(tmpDir))
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings.some(f => f.message.includes('scripts/build.js'))).toBe(true)
  })

  it('finds no finding when node script exists', async () => {
    writeFile(tmpDir, 'scripts/build.js', '')
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow(
      '      - name: Run\n        run: node scripts/build.js\n',
    ))
    expect(await caCi003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding for missing working-directory', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow(
      '      - name: Build\n        working-directory: ./packages/app\n        run: npm install\n',
    ))
    const findings = await caCi003.run(makeCtx(tmpDir))
    expect(findings.some(f => f.message.includes('packages/app'))).toBe(true)
  })

  it('finds no finding when working-directory exists', async () => {
    writeFile(tmpDir, 'packages/app/.gitkeep', '')
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow(
      '      - name: Build\n        working-directory: ./packages/app\n        run: npm install\n',
    ))
    expect(await caCi003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding for missing bash script', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow(
      '      - name: Deploy\n        run: bash scripts/deploy.sh\n',
    ))
    const findings = await caCi003.run(makeCtx(tmpDir))
    expect(findings.some(f => f.message.includes('scripts/deploy.sh'))).toBe(true)
  })

  it('finds no finding when bash script exists', async () => {
    writeFile(tmpDir, 'scripts/deploy.sh', '#!/bin/bash')
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow(
      '      - name: Deploy\n        run: bash scripts/deploy.sh\n',
    ))
    expect(await caCi003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding for ./scripts/ bare invocation', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow(
      '      - name: Run\n        run: ./scripts/check.sh\n',
    ))
    const findings = await caCi003.run(makeCtx(tmpDir))
    expect(findings.some(f => f.message.includes('scripts/check.sh'))).toBe(true)
  })

  it('returns no findings when no workflow files exist', async () => {
    expect(await caCi003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('respects excluded workflow files', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow(
      '      - name: Run\n        run: node scripts/build.js\n',
    ))
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: ['.github/workflows/ci.yml'], rules: {} },
    }
    expect(await caCi003.run(ctx)).toHaveLength(0)
  })
})
