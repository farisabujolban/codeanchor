import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caCi002 } from '../../src/rules/ca-ci002.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-ci002-'))
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
    config: { exclude: [], rules: { 'CA-CI002': { severity: 'warn' } } },
  }
}

function workflow(nodeVersion: string): string {
  return `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
`.trimStart()
}

describe('CA-CI002', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a finding when setup-node major differs from .nvmrc', async () => {
    writeFile(tmpDir, '.nvmrc', '20.11.1\n')
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow('18.19.0'))

    const findings = await caCi002.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-CI002')
    expect(findings[0].file).toBe('.github/workflows/ci.yml')
    expect(findings[0].message).toContain('.nvmrc')
    expect(findings[0].message).toContain('major 18')
    expect(findings[0].message).toContain('major 20')
  })

  it('uses package.json engines.node when .nvmrc is absent', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ engines: { node: '>=20' } }))
    writeFile(tmpDir, '.github/workflows/ci.yaml', workflow('18'))

    const findings = await caCi002.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('engines.node in package.json')
  })

  it('finds no finding when setup-node matches the reference major', async () => {
    writeFile(tmpDir, '.nvmrc', '20')
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow('20.12.2'))

    expect(await caCi002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds no finding when no Node version reference exists', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow('18'))

    expect(await caCi002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds no finding when setup-node does not specify node-version', async () => {
    writeFile(tmpDir, '.nvmrc', '20')
    writeFile(tmpDir, '.github/workflows/ci.yml', `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`.trimStart())

    expect(await caCi002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('prefers .nvmrc over package.json engines.node when both are present', async () => {
    writeFile(tmpDir, '.nvmrc', '20\n')
    writeFile(tmpDir, 'package.json', JSON.stringify({ engines: { node: '>=18' } }))
    writeFile(tmpDir, '.github/workflows/ci.yml', workflow('20'))

    expect(await caCi002.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})
