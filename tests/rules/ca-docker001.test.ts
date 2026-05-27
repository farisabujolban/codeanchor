import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caDocker001 } from '../../src/rules/ca-docker001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docker001-'))
}

function writeFile(dir: string, name: string, content: string): void {
  const full = path.join(dir, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

function makeCtx(tmpDir: string): RuleContext {
  return {
    mode: 'repo',
    repoRoot: tmpDir,
    config: { exclude: [], rules: { 'CA-DOCKER001': { severity: 'warn' } } },
  }
}

describe('CA-DOCKER001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds no finding when COPY source exists', async () => {
    writeFile(tmpDir, 'src/app.ts', 'export {}')
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nCOPY src/app.ts /app/app.ts\n')
    const findings = await caDocker001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('finds a finding when COPY source is missing', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nCOPY dist/bundle.js /app/bundle.js\n')
    const findings = await caDocker001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-DOCKER001')
    expect(findings[0].message).toContain('dist/bundle.js')
    expect(findings[0].line).toBe(2)
  })

  it('ignores COPY --from= multi-stage references', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20 AS builder\nFROM nginx\nCOPY --from=builder /app .\n')
    const findings = await caDocker001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('ignores ADD with URL source', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nADD https://example.com/file.tar.gz /tmp/\n')
    const findings = await caDocker001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('finds a finding when ADD source is a missing local path', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nADD missing-archive.tar.gz /app/\n')
    const findings = await caDocker001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('missing-archive.tar.gz')
  })

  it('returns no findings when no Dockerfile is present', async () => {
    const findings = await caDocker001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(0)
  })

  it('handles Dockerfile.prod naming', async () => {
    writeFile(tmpDir, 'Dockerfile.prod', 'FROM node:20\nCOPY dist/app.js .\n')
    const findings = await caDocker001.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('Dockerfile.prod')
  })
})
