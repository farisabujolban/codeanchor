import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { isoMai003 } from '../../src/rules/iso-mai003.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-mai003-'))
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  execSync('git config commit.gpgsign false', { cwd: dir })
  return dir
}

function writeAndCommit(dir: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(dir, relPath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
  }
  execSync('git add -A', { cwd: dir })
  execSync('git commit -m "add"', { cwd: dir })
}

function makeCtx(dir: string, threshold?: number): RuleContext {
  return {
    mode: 'repo',
    repoRoot: dir,
    config: {
      exclude: [],
      rules: threshold !== undefined ? { 'ISO-MAI003': { threshold } as never } : {},
    },
  }
}

// Generate N importers of a file
function makeImporters(count: number, target: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    files[`src/consumer${i}.ts`] = `import { x } from './${target}'`
  }
  return files
}

describe('ISO-MAI003', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempGitRepo() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags a file imported by more files than the default threshold (15)', async () => {
    const files: Record<string, string> = { 'src/shared.ts': `export const x = 1` }
    Object.assign(files, makeImporters(16, 'shared'))
    writeAndCommit(tmpDir, files)

    const findings = await isoMai003.run(makeCtx(tmpDir))
    const shared = findings.find(f => f.file === 'src/shared.ts')
    expect(shared).toBeDefined()
    expect(shared?.ruleId).toBe('ISO-MAI003')
    expect(shared?.message).toContain('16')
  })

  it('does NOT flag a file imported by fewer files than the threshold', async () => {
    const files: Record<string, string> = { 'src/shared.ts': `export const x = 1` }
    Object.assign(files, makeImporters(5, 'shared'))
    writeAndCommit(tmpDir, files)

    expect(await isoMai003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('respects a custom threshold', async () => {
    const files: Record<string, string> = { 'src/shared.ts': `export const x = 1` }
    Object.assign(files, makeImporters(6, 'shared'))
    writeAndCommit(tmpDir, files)

    // threshold=5 → 6 importers → should flag
    expect(await isoMai003.run(makeCtx(tmpDir, 5))).toHaveLength(1)
    // threshold=10 → 6 importers → should NOT flag
    expect(await isoMai003.run(makeCtx(tmpDir, 10))).toHaveLength(0)
  })

  it('does NOT flag barrel index files even if imported by many', async () => {
    const files: Record<string, string> = { 'src/index.ts': `export * from './shared'`, 'src/shared.ts': `export const x = 1` }
    Object.assign(files, makeImporters(20, 'index'))
    writeAndCommit(tmpDir, files)

    const findings = await isoMai003.run(makeCtx(tmpDir))
    expect(findings.every(f => f.file !== 'src/index.ts')).toBe(true)
  })

  it('does NOT flag .d.ts files', async () => {
    const files: Record<string, string> = { 'src/types.d.ts': `export type Foo = string` }
    Object.assign(files, makeImporters(20, 'types'))
    writeAndCommit(tmpDir, files)

    // d.ts files typically won't be in tracked set as JS/TS imports, but if they are:
    const findings = await isoMai003.run(makeCtx(tmpDir))
    expect(findings.every(f => !f.file.endsWith('.d.ts'))).toBe(true)
  })

  it('counts only internal (relative) imports, not npm packages', async () => {
    writeAndCommit(tmpDir, {
      'src/shared.ts': `export const x = 1`,
      'src/a.ts': `import lodash from 'lodash'`,  // external, should not count
      'src/b.ts': `import { x } from './shared'`,  // internal, counts
    })

    // Only 1 internal importer — below default threshold
    expect(await isoMai003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('includes the importer count in the finding message', async () => {
    const files: Record<string, string> = { 'src/core.ts': `export const x = 1` }
    for (let i = 0; i < 18; i++) {
      files[`src/mod${i}.ts`] = `import { x } from './core'`
    }
    writeAndCommit(tmpDir, files)

    const findings = await isoMai003.run(makeCtx(tmpDir))
    expect(findings[0].message).toContain('18')
  })
})
