import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { caOwn001 } from '../../src/rules/ca-own001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-own001-'))
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
    config: { exclude: [], rules: { 'CA-OWN001': { severity: 'warn' } } },
    since: '90d',
  }
}

describe('CA-OWN001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('returns no findings when no CODEOWNERS file exists', async () => {
    for (let i = 0; i < 4; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `change ${i}`)
    }
    const findings = await caOwn001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('finds a finding when hot file has no CODEOWNERS entry', async () => {
    writeAndCommit(tmpDir, '.github/CODEOWNERS', '*.md @team/docs', 'add codeowners')
    for (let i = 0; i < 4; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `change ${i}`)
    }
    const findings = await caOwn001.run(makeCtx(tmpDir))
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings[0].ruleId).toBe('CA-OWN001')
    expect(findings[0].file).toBe('src/api.ts')
  })

  it('finds no finding when hot file is covered by a wildcard pattern', async () => {
    writeAndCommit(tmpDir, '.github/CODEOWNERS', 'src/* @team/backend', 'add codeowners')
    for (let i = 0; i < 4; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `change ${i}`)
    }
    const findings = await caOwn001.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })

  it('finds no finding when hot file is covered by extension wildcard', async () => {
    writeAndCommit(tmpDir, '.github/CODEOWNERS', '*.ts @team/ts-team', 'add codeowners')
    for (let i = 0; i < 4; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `change ${i}`)
    }
    const findings = await caOwn001.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })

  it('finds a finding when CODEOWNERS pattern does not match the hot file', async () => {
    writeAndCommit(tmpDir, '.github/CODEOWNERS', '/docs/ @team/docs', 'add codeowners')
    for (let i = 0; i < 4; i++) {
      writeAndCommit(tmpDir, 'src/api.ts', `export const v = ${i}`, `change ${i}`)
    }
    const findings = await caOwn001.run(makeCtx(tmpDir))
    expect(findings.some(f => f.file === 'src/api.ts')).toBe(true)
  })
})
