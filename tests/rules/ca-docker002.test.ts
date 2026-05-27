import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caDocker002 } from '../../src/rules/ca-docker002.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docker002-'))
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
    config: { exclude: [], rules: { 'CA-DOCKER002': { severity: 'warn' } } },
  }
}

describe('CA-DOCKER002', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a finding when RUN npm run references missing script', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nRUN npm run deploy\n')
    const findings = await caDocker002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-DOCKER002')
    expect(findings[0].message).toContain('"deploy"')
  })

  it('finds no finding when RUN npm run script exists', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc', test: 'vitest' } }))
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nRUN npm run build\n')
    expect(await caDocker002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('finds a finding when RUN pnpm references missing script', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nRUN pnpm lint\n')
    const findings = await caDocker002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('"lint"')
  })

  it('finds a finding for CMD node dist/index.js when file is missing', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nCMD node dist/index.js\n')
    const findings = await caDocker002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('dist/index.js')
  })

  it('finds no finding for CMD node when file exists', async () => {
    writeFile(tmpDir, 'dist/index.js', '')
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nCMD node dist/index.js\n')
    expect(await caDocker002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('handles CMD JSON array form', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nCMD ["node", "dist/server.js"]\n')
    const findings = await caDocker002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('dist/server.js')
  })

  it('finds no finding for CMD JSON array when file exists', async () => {
    writeFile(tmpDir, 'dist/server.js', '')
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nCMD ["node", "dist/server.js"]\n')
    expect(await caDocker002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('handles ENTRYPOINT', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nENTRYPOINT ["node", "dist/app.js"]\n')
    const findings = await caDocker002.run(makeCtx(tmpDir))
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('dist/app.js')
  })

  it('returns no findings when no Dockerfile is present', async () => {
    expect(await caDocker002.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('respects excluded Dockerfiles', async () => {
    writeFile(tmpDir, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }))
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nRUN npm run deploy\n')
    const ctx: RuleContext = {
      mode: 'repo',
      repoRoot: tmpDir,
      config: { exclude: ['Dockerfile'], rules: {} },
    }
    expect(await caDocker002.run(ctx)).toHaveLength(0)
  })

  it('does not flag RUN when no package.json exists', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:20\nRUN npm run build\n')
    // No package.json — no scripts to check against
    expect(await caDocker002.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})
