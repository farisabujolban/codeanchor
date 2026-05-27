import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caCi001 } from '../../src/rules/ca-ci001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-ci001-'))
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
    config: { exclude: [], rules: { 'CA-CI001': { severity: 'error' } } },
  }
}

const baseWorkflow = (runStep: string) => `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run step
        run: ${runStep}
`.trimStart()

describe('CA-CI001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds no finding when referenced script exists', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { test: 'vitest' } }))
    writeFile(tmpDir, '.github/workflows/ci.yml', baseWorkflow('npm run test'))
    const findings = await caCi001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('finds a finding when referenced script is missing', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, '.github/workflows/ci.yml', baseWorkflow('npm run deploy'))
    const findings = await caCi001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-CI001')
    expect(findings[0].message).toContain('"deploy"')
  })

  it('finds one finding in a multi-line run block with one missing script', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    const workflow = `name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run steps
        run: |
          npm run build
          npm run type-check
`
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow)
    const findings = await caCi001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('"type-check"')
  })

  it('handles yarn and pnpm syntax', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, '.github/workflows/ci.yml', baseWorkflow('yarn deploy'))
    const findings = await caCi001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('"deploy"')
  })

  it('returns no findings when no workflow files exist', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    const findings = await caCi001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('returns no findings when package.json is missing', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', baseWorkflow('npm run build'))
    const findings = await caCi001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })
})
