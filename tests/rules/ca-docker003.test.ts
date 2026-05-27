import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caDocker003 } from '../../src/rules/ca-docker003.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docker003-'))
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
    config: { exclude: [], rules: { 'CA-DOCKER003': { severity: 'warn' } } },
  }
}

describe('CA-DOCKER003', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds a finding when FROM uses latest', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node:latest\n')

    const findings = await caDocker003.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('CA-DOCKER003')
    expect(findings[0].message).toContain('uses :latest')
  })

  it('finds a finding when FROM has no tag', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM node\n')

    const findings = await caDocker003.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('has no tag')
  })

  it('finds no finding for pinned tags and digest refs', async () => {
    writeFile(tmpDir, 'Dockerfile', `
FROM node:20.11.1
FROM alpine@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`.trimStart())

    expect(await caDocker003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('skips scratch and valid multi-stage aliases', async () => {
    writeFile(tmpDir, 'Dockerfile', `
FROM scratch AS empty
FROM node:20 AS builder
RUN npm run build
FROM builder AS output
FROM output
`.trimStart())

    expect(await caDocker003.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('handles FROM flags before the image', async () => {
    writeFile(tmpDir, 'Dockerfile', 'FROM --platform=linux/amd64 node\n')

    const findings = await caDocker003.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('"node"')
  })

  it('returns no findings when no Dockerfile is present', async () => {
    expect(await caDocker003.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})
