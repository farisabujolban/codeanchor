import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caCi004 } from '../../src/rules/ca-ci004.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-ci004-'))
}
function writeFile(dir: string, name: string, content: string): void {
  const full = path.join(dir, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}
function makeCtx(dir: string): RuleContext {
  return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } }
}

describe('CA-CI004', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags unpinned @v3 ref', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', `
jobs:
  build:
    steps:
      - uses: actions/checkout@v3
`)
    const findings = await caCi004.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-CI004')
    expect(findings[0].message).toContain('actions/checkout@v3')
  })

  it('flags @main ref', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', `steps:\n  - uses: actions/setup-node@main`)
    expect(await caCi004.run(makeCtx(tmpDir))).toHaveLength(1)
  })

  it('does not flag full SHA-pinned ref', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@a81bbbef8bba57813eb5e93bfbceda2e3ed45cf1`)
    expect(await caCi004.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('does not flag short (7-char) SHA', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@a81bbbef`)
    expect(await caCi004.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('does not flag local actions', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', `steps:\n  - uses: ./local-action`)
    expect(await caCi004.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('flags multiple unpinned actions', async () => {
    writeFile(tmpDir, '.github/workflows/ci.yml', `
steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-node@v4
`)
    expect(await caCi004.run(makeCtx(tmpDir))).toHaveLength(2)
  })
})