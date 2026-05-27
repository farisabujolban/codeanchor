import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caDocs002 } from '../../src/rules/ca-docs002.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docs002-'))
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
    config: { exclude: [], rules: { 'CA-DOCS002': { severity: 'error' } } },
  }
}

describe('CA-DOCS002', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds no finding when linked file exists', async () => {
    writeFile(tmpDir, 'CONTRIBUTING.md', '# Contributing')
    writeFile(tmpDir, 'README.md', 'See [Contributing](./CONTRIBUTING.md).')
    const findings = await caDocs002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('finds a finding when linked file is missing', async () => {
    writeFile(tmpDir, 'README.md', 'See [Setup](./SETUP.md).')
    const findings = await caDocs002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-DOCS002')
    expect(findings[0].message).toContain('SETUP.md')
  })

  it('ignores https:// links', async () => {
    writeFile(tmpDir, 'README.md', 'Visit [example](https://example.com).')
    const findings = await caDocs002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('strips #anchor before checking existence', async () => {
    writeFile(tmpDir, 'README.md', '# Readme\nSee [section](./README.md#section).')
    const findings = await caDocs002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('handles ../relative links correctly', async () => {
    writeFile(tmpDir, 'docs/GUIDE.md', 'See [root](../README.md).')
    // README.md does not exist
    const findings = await caDocs002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('docs/GUIDE.md')
    expect(findings[0].message).toContain('../README.md')
  })

  it('reports the correct line number', async () => {
    writeFile(tmpDir, 'README.md', '# Title\n\nSee [missing](./GONE.md).')
    const findings = await caDocs002.run(makeCtx(tmpDir))
    expect(findings[0].line).toBe(3)
  })
})
