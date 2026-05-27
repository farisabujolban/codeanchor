import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { caTest002 } from '../../src/rules/ca-test002.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-test002-'))
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  execSync('git config commit.gpgsign false', { cwd: dir })
  return dir
}

function writeAndCommit(dir: string, file: string, content: string, msg: string): void {
  const full = path.join(dir, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
  execSync(`git add "${file}"`, { cwd: dir })
  execSync(`git commit -m "${msg}"`, { cwd: dir })
}

function makeCtx(dir: string): RuleContext {
  return {
    mode: 'history',
    repoRoot: dir,
    config: { exclude: [], rules: { 'CA-TEST002': { severity: 'warn' } } },
    since: '90d',
  }
}

describe('CA-TEST002', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags hot source whose test file was never committed', async () => {
    // Test file exists on disk but was never committed — 0 commits in window
    const testFile = path.join(tmpDir, 'src', 'api.test.ts')
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
    fs.writeFileSync(testFile, `test('base', () => {})`, 'utf-8')
    for (let i = 0; i < 3; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `src change ${i}`)
    }
    const findings = await caTest002.run(makeCtx(tmpDir))
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings[0].ruleId).toBe('CA-TEST002')
    expect(findings[0].file).toBe('src/api.ts')
  })

  it('finds no finding when test file has at least one commit in the window', async () => {
    for (let i = 0; i < 3; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `src ${i}`)
    }
    writeAndCommit(tmpDir, 'src/api.test.ts', `test('v', () => {})`, 'add test')
    const findings = await caTest002.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })

  it('finds no finding when there is no test file (handled by CA-TEST001)', async () => {
    for (let i = 0; i < 6; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `src ${i}`)
    }
    const findings = await caTest002.run(makeCtx(tmpDir))
    // CA-TEST002 skips files without a test — that's CA-TEST001's job
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })
})
