import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caMigration001 } from '../../src/rules/ca-migration001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-migration001-'))
}
function writeFile(dir: string, name: string, content: string): void {
  const full = path.join(dir, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}
function makeCtx(dir: string): RuleContext {
  return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } }
}

describe('CA-MIGRATION001', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('flags up migration without corresponding down', async () => {
    writeFile(tmpDir, 'migrations/001.up.sql', 'CREATE TABLE users (id INT);')
    const findings = await caMigration001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-MIGRATION001')
    expect(findings[0].message).toContain('001.up.sql')
  })

  it('no finding when matching down migration exists', async () => {
    writeFile(tmpDir, 'migrations/001.up.sql', 'CREATE TABLE users (id INT);')
    writeFile(tmpDir, 'migrations/001.down.sql', 'DROP TABLE users;')
    expect(await caMigration001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('flags one missing out of two migrations', async () => {
    writeFile(tmpDir, 'migrations/001.up.sql', 'CREATE TABLE users (id INT);')
    writeFile(tmpDir, 'migrations/001.down.sql', 'DROP TABLE users;')
    writeFile(tmpDir, 'migrations/002.up.sql', 'ALTER TABLE users ADD email TEXT;')
    const findings = await caMigration001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toContain('002.up.sql')
  })

  it('no finding when directory has no up/down files', async () => {
    writeFile(tmpDir, 'migrations/0001_create_users.ts', 'export const up = () => {}')
    expect(await caMigration001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('no finding when no migrations directory exists', async () => {
    expect(await caMigration001.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})