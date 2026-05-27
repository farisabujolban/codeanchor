import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caDocs004 } from '../../src/rules/ca-docs004.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docs004-'))
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
    config: { exclude: [], rules: { 'CA-DOCS004': { severity: 'warn' } } },
  }
}

describe('CA-DOCS004', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds findings for stale package version refs and static shields badges', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'demo-pkg', version: '2.0.0' }))
    writeFile(tmpDir, 'README.md', `
npm install demo-pkg@1.9.0
![version](https://img.shields.io/badge/version-1.9.0-blue)
`.trimStart())

    const findings = await caDocs004.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(2)
    expect(findings[0].message).toContain('demo-pkg@1.9.0')
    expect(findings[1].message).toContain('Static version badge')
  })

  it('finds no finding when docs match package.json version', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ name: '@scope/demo-pkg', version: '2.0.0' }))
    writeFile(tmpDir, 'README.md', `
npm install @scope/demo-pkg@2.0.0
![version](https://img.shields.io/badge/version-2.0.0-blue)
`.trimStart())

    expect(await caDocs004.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('checks markdown files under docs', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'demo-pkg', version: '2.0.0' }))
    writeFile(tmpDir, 'docs/install.md', 'Use demo-pkg@1.0.0 for installation.\n')

    const findings = await caDocs004.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('docs/install.md')
  })

  it('does not flag dynamic npm shields badges', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'demo-pkg', version: '2.0.0' }))
    writeFile(tmpDir, 'README.md', '![npm](https://img.shields.io/npm/v/demo-pkg)\n')

    expect(await caDocs004.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('returns no findings when package metadata is incomplete', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'demo-pkg' }))
    writeFile(tmpDir, 'README.md', 'npm install demo-pkg@1.0.0\n')

    expect(await caDocs004.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})
