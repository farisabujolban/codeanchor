import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runEngine } from '../src/engine.js'
import type { RuleContext } from '../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rd-engine-'))
}

function writeFile(dir: string, name: string, content: string): void {
  const full = path.join(dir, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

describe('engine --rules filtering', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('only runs the specified rule when ruleIds is set', async () => {
    // Set up a finding for CA-DOCS001 and CA-PKG001, then restrict to just CA-DOCS001
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'README.md', 'Run `npm run missing`.')

    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: [], rules: {} },
      ruleIds: ['CA-DOCS001'],
    }
    const result = await runEngine(ctx)
    expect(result.findings.every(f => f.ruleId === 'CA-DOCS001')).toBe(true)
  })

  it('returns no findings when ruleIds specifies a rule that does not apply to the mode', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: [], rules: {} },
      ruleIds: ['CA-CD001'], // staged-only rule
    }
    const result = await runEngine(ctx)
    expect(result.findings).toHaveLength(0)
  })

  it('runs all applicable rules when ruleIds is undefined', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'README.md', 'Run `npm run missing`.')
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: [], rules: {} },
    }
    const result = await runEngine(ctx)
    // Should have at least a finding from CA-DOCS001
    expect(result.findings.some(f => f.ruleId === 'CA-DOCS001')).toBe(true)
  })
})

describe('engine global exclude', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('excludes doc files from CA-DOCS001 when pattern matches', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'README.md', 'Run `npm run missing`.')
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: ['README.md'], rules: {} },
      ruleIds: ['CA-DOCS001'],
    }
    const result = await runEngine(ctx)
    expect(result.findings.filter(f => f.ruleId === 'CA-DOCS001')).toHaveLength(0)
  })

  it('excludes Dockerfiles from CA-DOCKER001 when pattern matches', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nCOPY dist/missing.js .\n')
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: ['Dockerfile'], rules: {} },
      ruleIds: ['CA-DOCKER001'],
    }
    const result = await runEngine(ctx)
    expect(result.findings.filter(f => f.ruleId === 'CA-DOCKER001')).toHaveLength(0)
  })

  it('excludes workflow files from CA-CI001 when pattern matches', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, '.github/workflows/ci.yml',
      'name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run missing\n')
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: ['.github/workflows/ci.yml'], rules: {} },
      ruleIds: ['CA-CI001'],
    }
    const result = await runEngine(ctx)
    expect(result.findings.filter(f => f.ruleId === 'CA-CI001')).toHaveLength(0)
  })
})
