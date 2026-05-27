import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caDocker004 } from '../../src/rules/ca-docker004.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docker004-'))
}
function writeFile(dir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(dir, name), content, 'utf-8')
}
function makeCtx(dir: string): RuleContext {
  return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } }
}

describe('CA-DOCKER004', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags ENV PASSWORD=value', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nENV PASSWORD=secret123\n')
    const findings = await caDocker004.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-DOCKER004')
    expect(findings[0].message).toContain('PASSWORD')
  })

  it('flags ENV with legacy space form', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nENV SECRET myvalue\n')
    expect(await caDocker004.run(makeCtx(tmpDir))).toHaveLength(1)
  })

  it('flags ARG with hardcoded default', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nARG API_KEY=default_key\n')
    expect(await caDocker004.run(makeCtx(tmpDir))).toHaveLength(1)
  })

  it('does not flag ARG without default', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nARG API_KEY\n')
    expect(await caDocker004.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('does not flag non-credential ENV vars', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nENV NODE_ENV=production\nENV PORT=3000\n')
    expect(await caDocker004.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})