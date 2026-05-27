import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caLock001 } from '../../src/rules/ca-lock001.js'
import type { RuleContext } from '../../src/engine.js'
import type { FileDiff } from '../../src/types.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-lock001-'))
}

function writeFile(dir: string, name: string, content: string): void {
  const full = path.join(dir, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

function makeDiff(p: string, changedLines: number[] = [1]): FileDiff {
  return { path: p, status: 'modified', changedLines: new Set(changedLines) }
}

function makeCtx(tmpDir: string, diffs: FileDiff[]): RuleContext {
  return {
    mode: 'staged',
    repoRoot: tmpDir,
    config: { exclude: [], rules: { 'CA-LOCK001': { severity: 'error' } } },
    stagedDiffs: diffs,
  }
}

const basePkg = JSON.stringify({
  name: 'test',
  dependencies: { lodash: '4.0.0' },
})

const updatedPkg = JSON.stringify({
  name: 'test',
  dependencies: { lodash: '4.17.21' },
})

describe('CA-LOCK001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('returns no findings when package.json is not in the diff', async () => {
    writeFile(tmpDir, 'package-lock.json', '{}')
    const ctx = makeCtx(tmpDir, [makeDiff('src/index.ts')])
    expect(await caLock001.run(ctx)).toHaveLength(0)
  })

  it('returns no findings when no lockfile exists in the repo', async () => {
    writeFile(tmpDir, 'package.json', updatedPkg)
    const ctx = makeCtx(tmpDir, [makeDiff('package.json')])
    expect(await caLock001.run(ctx)).toHaveLength(0)
  })

  it('returns no findings when lockfile is also changed', async () => {
    writeFile(tmpDir, 'package.json', updatedPkg)
    writeFile(tmpDir, 'package-lock.json', '{}')
    const ctx = makeCtx(tmpDir, [
      makeDiff('package.json'),
      makeDiff('package-lock.json'),
    ])
    expect(await caLock001.run(ctx)).toHaveLength(0)
  })

  it('finds a finding when package.json dep changed but lockfile was not updated', async () => {
    writeFile(tmpDir, 'package.json', updatedPkg)
    writeFile(tmpDir, 'package-lock.json', '{}')
    // Only package.json in diff, no lockfile
    const ctx = makeCtx(tmpDir, [makeDiff('package.json')])
    const findings = await caLock001.run(ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-LOCK001')
    expect(findings[0].message).toContain('package-lock.json')
  })

  it('finds a finding with yarn.lock present', async () => {
    writeFile(tmpDir, 'package.json', updatedPkg)
    writeFile(tmpDir, 'yarn.lock', '')
    const ctx = makeCtx(tmpDir, [makeDiff('package.json')])
    const findings = await caLock001.run(ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('yarn.lock')
  })

  it('returns no findings when only non-dep fields changed (uses PR heuristic)', async () => {
    const nonDepPkg = JSON.stringify({ name: 'test', scripts: { build: 'tsc' } })
    writeFile(tmpDir, 'package.json', nonDepPkg)
    writeFile(tmpDir, 'package-lock.json', '{}')
    // Changed lines don't touch dep fields
    const ctx: RuleContext = {
      mode: 'pr',
      repoRoot: tmpDir,
      config: { exclude: [], rules: {} },
      stagedDiffs: [{ path: 'package.json', status: 'modified', changedLines: new Set([2]) }],
    }
    // Line 2 of nonDepPkg is `"name": "test"` — no dep field
    const findings = await caLock001.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('returns no findings when stagedDiffs is undefined', async () => {
    const ctx: RuleContext = {
      mode: 'staged',
      repoRoot: tmpDir,
      config: { exclude: [], rules: {} },
    }
    expect(await caLock001.run(ctx)).toHaveLength(0)
  })
})
