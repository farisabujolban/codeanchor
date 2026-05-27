import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { caOwn002 } from '../../src/rules/ca-own002.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-own002-'))
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
    config: { exclude: [], rules: { 'CA-OWN002': { severity: 'warn' } } },
  }
}

describe('CA-OWN002', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a finding when a CODEOWNERS pattern matches zero tracked files', async () => {
    writeAndCommit(tmpDir, 'src/index.ts', 'export const ok = true\n', 'add source')
    writeAndCommit(tmpDir, '.github/CODEOWNERS', 'legacy/* @team/legacy\n', 'add codeowners')

    const findings = await caOwn002.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-OWN002')
    expect(findings[0].file).toBe('.github/CODEOWNERS')
    expect(findings[0].message).toContain('legacy/*')
  })

  it('finds no finding when a CODEOWNERS pattern matches a tracked file', async () => {
    writeAndCommit(tmpDir, 'src/index.ts', 'export const ok = true\n', 'add source')
    writeAndCommit(tmpDir, '.github/CODEOWNERS', 'src/* @team/app\n', 'add codeowners')

    expect(await caOwn002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('only considers tracked files when checking whether a pattern matches', async () => {
    writeAndCommit(tmpDir, 'src/index.ts', 'export const ok = true\n', 'add source')
    writeAndCommit(tmpDir, '.github/CODEOWNERS', 'generated/* @team/generated\n', 'add codeowners')
    writeFile(tmpDir, 'generated/schema.ts', 'export const generated = true\n')

    const findings = await caOwn002.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('generated/*')
  })

  it('skips trivially broad patterns', async () => {
    writeAndCommit(tmpDir, 'src/index.ts', 'export const ok = true\n', 'add source')
    writeAndCommit(tmpDir, '.github/CODEOWNERS', '* @team/all\n', 'add codeowners')

    expect(await caOwn002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('returns no findings when no CODEOWNERS file exists', async () => {
    writeAndCommit(tmpDir, 'src/index.ts', 'export const ok = true\n', 'add source')

    expect(await caOwn002.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})
