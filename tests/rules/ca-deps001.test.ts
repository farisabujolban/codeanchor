import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { caDeps001 } from '../../src/rules/ca-deps001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-deps001-'))
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  execSync('git config commit.gpgsign false', { cwd: dir })
  return dir
}
function addAndCommit(dir: string, file: string, content: string): void {
  const full = path.join(dir, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  execSync(`git add .`, { cwd: dir })
  execSync(`git commit -m "add"`, { cwd: dir })
}
function makeCtx(dir: string): RuleContext {
  return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } }
}

describe('CA-DEPS001', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags prod dep only imported in test files', async () => {
    addAndCommit(tmpDir, 'package.json', JSON.stringify({ dependencies: { vitest: '*' } }))
    addAndCommit(tmpDir, 'src/api.test.ts', `import { expect } from 'vitest'`)
    const findings = await caDeps001.run(makeCtx(tmpDir))
    expect(findings.length).toBeGreaterThanOrEqual(1)
    expect(findings[0].ruleId).toBe('CA-DEPS001')
    expect(findings[0].message).toContain('vitest')
  })

  it('no finding when dep is imported in non-test file', async () => {
    addAndCommit(tmpDir, 'package.json', JSON.stringify({ dependencies: { express: '*' } }))
    addAndCommit(tmpDir, 'src/server.ts', `import express from 'express'`)
    expect(await caDeps001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('no finding when dep is imported in both test and non-test', async () => {
    addAndCommit(tmpDir, 'package.json', JSON.stringify({ dependencies: { zod: '*' } }))
    addAndCommit(tmpDir, 'src/schema.ts', `import { z } from 'zod'`)
    addAndCommit(tmpDir, 'src/schema.test.ts', `import { z } from 'zod'`)
    expect(await caDeps001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('no finding when no dependencies', async () => {
    addAndCommit(tmpDir, 'package.json', JSON.stringify({ devDependencies: { vitest: '*' } }))
    expect(await caDeps001.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})