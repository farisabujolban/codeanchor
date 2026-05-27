import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caCd001 } from '../../src/rules/ca-cd001.js'
import type { FileDiff } from '../../src/types.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repo-drift-test-'))
}

function writeFile(dir: string, name: string, content: string): void {
  const full = path.join(dir, name)
  const parent = path.dirname(full)
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

function makeFileDiff(p: string, changedLines: number[]): FileDiff {
  return { path: p, status: 'modified', changedLines: new Set(changedLines) }
}

function makeCtx(tmpDir: string, stagedDiffs: FileDiff[]): RuleContext {
  return {
    mode: 'staged',
    repoRoot: tmpDir,
    config: {
      exclude: [],
      rules: { 'CA-CD001': { severity: 'error', maxOwnershipDistance: 20 } },
    },
    stagedDiffs,
  }
}

describe('CA-CD001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a stale comment in a TypeScript file', async () => {
    writeFile(tmpDir, 'api.ts', '// Handles user authentication\nconst x = 1\nconst y = 2\n')
    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('api.ts', [2, 3])]))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-CD001')
    expect(findings[0].file).toBe('api.ts')
    expect(findings[0].line).toBe(1)
    expect(findings[0].fix).toBe('codeanchor approve api.ts 1')
  })

  it('finds no finding when the comment also changed', async () => {
    writeFile(tmpDir, 'api.ts', '// Handles user authentication\nconst x = 1\n')
    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('api.ts', [1, 2])]))
    expect(findings).toHaveLength(0)
  })

  it('finds no finding when the code in the owned region did not change', async () => {
    writeFile(tmpDir, 'api.ts', '// Handles user authentication\nconst x = 1\n')
    // Line 25 is far outside the owned region
    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('api.ts', [25])]))
    expect(findings).toHaveLength(0)
  })

  it('finds a stale comment in a Python file', async () => {
    writeFile(tmpDir, 'utils.py', '# Handles user data\nx = 1\ny = 2\n')
    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('utils.py', [2, 3])]))
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('utils.py')
    expect(findings[0].line).toBe(1)
  })

  it('finds a stale comment in a Java file', async () => {
    writeFile(tmpDir, 'Auth.java', '// Handles authentication\npublic void auth() {\n  return;\n}\n')
    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('Auth.java', [2])]))
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('Auth.java')
  })

  it('ignores @ts-ignore directive comment', async () => {
    writeFile(tmpDir, 'api.ts', '// @ts-ignore\nconst x: any = badValue\n')
    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('api.ts', [2])]))
    expect(findings).toHaveLength(0)
  })

  it('ignores # type: ignore directive in Python', async () => {
    writeFile(tmpDir, 'utils.py', '# type: ignore\nx: int = "wrong"\n')
    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('utils.py', [2])]))
    expect(findings).toHaveLength(0)
  })

  it('skips added files', async () => {
    writeFile(tmpDir, 'new.ts', '// Brand new file\nconst x = 1\n')
    const diff: FileDiff = { path: 'new.ts', status: 'added', changedLines: new Set([1, 2]) }
    const findings = await caCd001.run(makeCtx(tmpDir, [diff]))
    expect(findings).toHaveLength(0)
  })

  it('skips deleted files', async () => {
    const diff: FileDiff = { path: 'gone.ts', status: 'deleted', changedLines: new Set([2]) }
    const findings = await caCd001.run(makeCtx(tmpDir, [diff]))
    expect(findings).toHaveLength(0)
  })

  it('skips unsupported file types', async () => {
    writeFile(tmpDir, 'styles.css', '/* Resets margin */\nbody { margin: 0; }\n')
    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('styles.css', [2])]))
    expect(findings).toHaveLength(0)
  })

  it('respects the exclude config', async () => {
    writeFile(tmpDir, 'dist/bundle.ts', '// Generated file\nconst x = 1\n')
    const ctx: RuleContext = {
      mode: 'staged',
      repoRoot: tmpDir,
      config: {
        exclude: ['dist/**'],
        rules: { 'CA-CD001': { severity: 'error', maxOwnershipDistance: 20 } },
      },
      stagedDiffs: [makeFileDiff('dist/bundle.ts', [2])],
    }
    const findings = await caCd001.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('returns empty array when rule is disabled', async () => {
    writeFile(tmpDir, 'api.ts', '// Handles user authentication\nconst x = 1\n')
    const ctx: RuleContext = {
      mode: 'staged',
      repoRoot: tmpDir,
      config: { exclude: [], rules: { 'CA-CD001': false } },
      stagedDiffs: [makeFileDiff('api.ts', [2])],
    }
    const findings = await caCd001.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('existing valid approval suppresses the finding', async () => {
    const content = '// Handles user authentication\nconst x = 1\n'
    writeFile(tmpDir, 'api.ts', content)

    // Build and save a valid approval
    const { extractLeadingComments } = await import('../../src/util/comment-parser.js')
    const { getOwnedRegion } = await import('../../src/util/ownership.js')
    const { buildApproval, upsertApproval, saveApprovals } = await import('../../src/util/approvals.js')
    const { getDriver } = await import('../../src/util/languages.js')

    const driver = getDriver('api.ts')!
    const lines = content.split('\n')
    const [comment] = extractLeadingComments(content, driver)
    const region = getOwnedRegion(comment, lines, 20, driver)!
    const store = { approvals: [] }
    upsertApproval(store, buildApproval('api.ts', comment, lines, region, tmpDir))
    saveApprovals(store, tmpDir)

    const findings = await caCd001.run(makeCtx(tmpDir, [makeFileDiff('api.ts', [2])]))
    expect(findings).toHaveLength(0)
  })
})
