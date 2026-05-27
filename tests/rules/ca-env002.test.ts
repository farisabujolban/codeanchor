import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { caEnv002 } from '../../src/rules/ca-env002.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-env002-'))
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  execSync('git config commit.gpgsign false', { cwd: dir })
  return dir
}
function addAndCommit(dir: string, file: string, content: string): void {
  fs.writeFileSync(path.join(dir, file), content)
  execSync(`git add "${file}"`, { cwd: dir })
  execSync(`git commit -m "add ${file}"`, { cwd: dir })
}
function makeCtx(dir: string): RuleContext {
  return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } }
}

describe('CA-ENV002', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags .env file tracked by git', async () => {
    addAndCommit(tmpDir, '.env', 'SECRET=abc')
    const findings = await caEnv002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-ENV002')
    expect(findings[0].file).toBe('.env')
  })

  it('does not flag .env.example', async () => {
    addAndCommit(tmpDir, '.env.example', 'SECRET=')
    expect(await caEnv002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('does not flag .env.sample or .env.template', async () => {
    addAndCommit(tmpDir, '.env.sample', 'KEY=')
    addAndCommit(tmpDir, '.env.template', 'KEY=')
    expect(await caEnv002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('flags .env.local and .env.production', async () => {
    addAndCommit(tmpDir, '.env.local', 'SECRET=abc')
    addAndCommit(tmpDir, '.env.production', 'PROD_KEY=xyz')
    expect(await caEnv002.run(makeCtx(tmpDir))).toHaveLength(2)
  })
})