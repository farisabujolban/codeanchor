import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caChangelog001 } from '../../src/rules/ca-changelog001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-changelog001-'))
}
function writeFile(dir: string, name: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
  fs.writeFileSync(path.join(dir, name), content, 'utf-8')
}
function makeCtx(dir: string): RuleContext {
  return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } }
}

describe('CA-CHANGELOG001', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags when version has no changelog entry', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ version: '1.2.0' }))
    writeFile(tmpDir, 'CHANGELOG.md', '## 1.1.0\n- old\n')
    const findings = await caChangelog001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-CHANGELOG001')
    expect(findings[0].message).toContain('1.2.0')
  })

  it('no finding when changelog entry exists', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ version: '1.2.0' }))
    writeFile(tmpDir, 'CHANGELOG.md', '## 1.2.0\n- new stuff\n## 1.1.0\n- old\n')
    expect(await caChangelog001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('accepts bracketed version format [1.2.0]', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ version: '1.2.0' }))
    writeFile(tmpDir, 'CHANGELOG.md', '## [1.2.0]\n- new stuff\n')
    expect(await caChangelog001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('no finding when no CHANGELOG file exists', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ version: '1.0.0' }))
    expect(await caChangelog001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('no finding when no package.json', async () => {
    writeFile(tmpDir, 'CHANGELOG.md', '## 1.0.0\n')
    expect(await caChangelog001.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})