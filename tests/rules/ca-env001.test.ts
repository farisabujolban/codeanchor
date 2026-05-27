import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { caEnv001 } from '../../src/rules/ca-env001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-env001-'))
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir })
  return dir
}

function writeFile(dir: string, file: string, content: string): void {
  const full = path.join(dir, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

function writeAndCommit(dir: string, file: string, content: string, msg: string): void {
  writeFile(dir, file, content)
  execFileSync('git', ['add', file], { cwd: dir })
  execFileSync('git', ['commit', '-m', msg], { cwd: dir })
}

function makeCtx(dir: string): RuleContext {
  return {
    mode: 'repo',
    repoRoot: dir,
    config: { exclude: [], rules: { 'CA-ENV001': { severity: 'warn' } } },
  }
}

describe('CA-ENV001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a finding when a tracked env file contains a key missing from .env.example', async () => {
    writeAndCommit(tmpDir, '.env.example', 'API_URL=\n', 'add env example')
    writeAndCommit(tmpDir, '.env.production', 'API_URL=https://example.com\nSECRET_KEY=value\n', 'add prod env')

    const findings = await caEnv001.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-ENV001')
    expect(findings[0].file).toBe('.env.production')
    expect(findings[0].message).toContain('SECRET_KEY')
  })

  it('finds no finding when all tracked env keys are documented by templates', async () => {
    writeAndCommit(tmpDir, '.env.example', 'API_URL=\nSECRET_KEY=\n', 'add env example')
    writeAndCommit(tmpDir, '.env.staging', 'API_URL=https://staging.example.com\nSECRET_KEY=value\n', 'add staging env')

    expect(await caEnv001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('only considers tracked env files', async () => {
    writeAndCommit(tmpDir, '.env.example', 'API_URL=\n', 'add env example')
    writeAndCommit(tmpDir, '.env.production', 'API_URL=https://example.com\n', 'add prod env')
    writeFile(tmpDir, '.env.staging', 'API_URL=https://staging.example.com\nSECRET_KEY=value\n')

    expect(await caEnv001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('merges keys from multiple template files', async () => {
    writeAndCommit(tmpDir, '.env.example', 'API_URL=\n', 'add env example')
    writeAndCommit(tmpDir, '.env.sample', 'SECRET_KEY=\n', 'add env sample')
    writeAndCommit(tmpDir, '.env.production', 'API_URL=https://example.com\nSECRET_KEY=value\n', 'add prod env')

    expect(await caEnv001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('returns no findings when no template file is tracked', async () => {
    writeAndCommit(tmpDir, '.env.production', 'SECRET_KEY=value\n', 'add prod env')

    expect(await caEnv001.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})
