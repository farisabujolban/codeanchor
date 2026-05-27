import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { caTodo003 } from '../../src/rules/ca-todo003.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-todo003-'))
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  execSync('git config commit.gpgsign false', { cwd: dir })
  return dir
}

function writeFile(dir: string, file: string, content: string): void {
  const full = path.join(dir, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

// Returns a @<unix-timestamp> string N days in the past
function daysAgoTs(days: number): string {
  return `@${Math.floor((Date.now() - days * 86400 * 1000) / 1000)}`
}

function commit(dir: string, msg: string, dateTs?: string): void {
  execSync('git add -A', { cwd: dir })
  const env = dateTs
    ? { ...process.env, GIT_AUTHOR_DATE: dateTs, GIT_COMMITTER_DATE: dateTs }
    : process.env
  execSync(`git commit -m "${msg}"`, { cwd: dir, env })
}

function makeCtx(dir: string): RuleContext {
  return {
    mode: 'history',
    repoRoot: dir,
    config: { exclude: [], rules: { 'CA-TODO003': { severity: 'warn' } } },
    since: '90d',
  }
}

describe('CA-TODO003', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a finding for TODO committed 100 days ago with no issue link', async () => {
    writeFile(tmpDir, 'src/api.ts', '// TODO: fix this\nexport const x = 1\n')
    commit(tmpDir, 'old todo', daysAgoTs(100))
    const findings = await caTodo003.run(makeCtx(tmpDir))
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings[0].ruleId).toBe('CA-TODO003')
    expect(findings[0].file).toBe('src/api.ts')
    expect(findings[0].line).toBe(1)
  })

  it('finds no finding for TODO with an issue link #123', async () => {
    writeFile(tmpDir, 'src/api.ts', '// TODO: fix this #123\nexport const x = 1\n')
    commit(tmpDir, 'todo with issue', daysAgoTs(100))
    const findings = await caTodo003.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })

  it('finds no finding for TODO committed only 2 days ago', async () => {
    writeFile(tmpDir, 'src/api.ts', '// TODO: fix this\nexport const x = 1\n')
    commit(tmpDir, 'recent todo', daysAgoTs(2))
    const findings = await caTodo003.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })

  it('finds a finding for FIXME with no issue link', async () => {
    writeFile(tmpDir, 'src/util.ts', 'export function foo() {\n  // FIXME: broken\n  return 1\n}\n')
    commit(tmpDir, 'old fixme', daysAgoTs(100))
    const findings = await caTodo003.run(makeCtx(tmpDir))
    expect(findings.some(f => f.file === 'src/util.ts')).toBe(true)
  })

  it('finds no finding for TODO with a URL link', async () => {
    writeFile(tmpDir, 'src/api.ts', '// TODO: see https://github.com/org/repo/issues/42\nexport const x = 1\n')
    commit(tmpDir, 'todo with url', daysAgoTs(100))
    const findings = await caTodo003.run(makeCtx(tmpDir))
    expect(findings.filter(f => f.file === 'src/api.ts')).toHaveLength(0)
  })
})
