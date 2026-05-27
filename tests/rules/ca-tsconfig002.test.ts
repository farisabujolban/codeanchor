import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caTsconfig002 } from '../../src/rules/ca-tsconfig002.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-tsconfig002-'))
}
function writeFile(dir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(dir, name), content, 'utf-8')
}
function makeCtx(dir: string): RuleContext {
  return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } }
}

describe('CA-TSCONFIG002', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags when strict is missing', async () => {
    writeFile(tmpDir, 'tsconfig.json', '{"compilerOptions":{}}')
    const findings = await caTsconfig002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-TSCONFIG002')
    expect(findings[0].message).toContain('not enabled')
  })

  it('flags when strict is explicitly false', async () => {
    writeFile(tmpDir, 'tsconfig.json', '{"compilerOptions":{"strict":false}}')
    const findings = await caTsconfig002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('explicitly set to false')
  })

  it('no finding when strict is true', async () => {
    writeFile(tmpDir, 'tsconfig.json', '{"compilerOptions":{"strict":true}}')
    expect(await caTsconfig002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('handles JSONC with comments', async () => {
    writeFile(tmpDir, 'tsconfig.json', '{\n// a comment\n"compilerOptions":{"strict":true}\n}')
    expect(await caTsconfig002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('no finding when no tsconfig.json', async () => {
    expect(await caTsconfig002.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})