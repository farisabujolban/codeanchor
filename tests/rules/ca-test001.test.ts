import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { caTest001 } from '../../src/rules/ca-test001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-test001-'))
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
    config: { exclude: [], rules: { 'CA-TEST001': { severity: 'warn' } } },
    since: '90d',
  }
}

describe('CA-TEST001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a finding when hot file has no test', async () => {
    for (let i = 0; i < 5; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `change ${i}`)
    }
    const findings = await caTest001.run(makeCtx(tmpDir))
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings[0].ruleId).toBe('CA-TEST001')
    expect(findings[0].file).toBe('src/api.ts')
  })

  it('finds no finding when hot file has a matching test', async () => {
    for (let i = 0; i < 5; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `change ${i}`)
    }
    writeAndCommit(tmpDir, 'src/api.test.ts', `test('ok', () => {})`, 'add test')
    const findings = await caTest001.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })

  it('finds no finding when file changed fewer than 3 times', async () => {
    writeAndCommit(tmpDir, 'src/api.ts', 'export const v = 1', 'first')
    writeAndCommit(tmpDir, 'src/api.ts', 'export const v = 2', 'second')
    const findings = await caTest001.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })

  it('finds a finding for a python file with no test', async () => {
    for (let i = 0; i < 4; i++) {
      writeAndCommit(tmpDir, 'src/utils.py', `x = ${i}`, `py change ${i}`)
    }
    const findings = await caTest001.run(makeCtx(tmpDir))
    expect(findings.some(f => f.file === 'src/utils.py')).toBe(true)
  })

  it('finds no finding for python file when test_<name>.py exists', async () => {
    for (let i = 0; i < 4; i++) {
      writeAndCommit(tmpDir, 'src/utils.py', `x = ${i}`, `py change ${i}`)
    }
    writeAndCommit(tmpDir, 'src/test_utils.py', 'def test_x(): pass', 'add py test')
    const findings = await caTest001.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/utils.py')).toHaveLength(0)
  })
})
