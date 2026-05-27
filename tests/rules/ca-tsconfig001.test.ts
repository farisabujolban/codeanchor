import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caTsconfig001 } from '../../src/rules/ca-tsconfig001.js'
import type { RuleContext } from '../../src/engine.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-tsconfig001-'))
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
    config: { exclude: [], rules: { 'CA-TSCONFIG001': { severity: 'error' } } },
  }
}

describe('CA-TSCONFIG001', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('finds findings for missing include, baseUrl, rootDir, and paths entries', async () => {
    writeFile(tmpDir, 'tsconfig.json', JSON.stringify({
      include: ['src/**/*', 'tests/**/*'],
      compilerOptions: {
        baseUrl: 'app',
        rootDir: 'src',
        paths: {
          '@shared/*': ['shared/*'],
        },
      },
    }))

    const findings = await caTsconfig001.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(5)
    expect(findings.map(f => f.message).join('\n')).toContain('"include" references "src/**/*"')
    expect(findings.map(f => f.message).join('\n')).toContain('"include" references "tests/**/*"')
    expect(findings.map(f => f.message).join('\n')).toContain('"compilerOptions.baseUrl"')
    expect(findings.map(f => f.message).join('\n')).toContain('"compilerOptions.rootDir"')
    expect(findings.map(f => f.message).join('\n')).toContain('compilerOptions.paths["@shared/*"]')
  })

  it('finds no finding for existing include, baseUrl, rootDir, and paths entries', async () => {
    writeFile(tmpDir, 'src/index.ts', '')
    writeFile(tmpDir, 'tests/index.test.ts', '')
    writeFile(tmpDir, 'shared/util.ts', '')
    writeFile(tmpDir, 'tsconfig.json', JSON.stringify({
      include: ['src/**/*', 'tests/**/*'],
      compilerOptions: {
        baseUrl: '.',
        rootDir: 'src',
        paths: {
          '@shared/*': ['shared/*'],
        },
      },
    }))

    expect(await caTsconfig001.run(makeCtx(tmpDir))).toHaveLength(0)
  })

  it('parses JSONC comments and trailing commas', async () => {
    writeFile(tmpDir, 'src/index.ts', '')
    writeFile(tmpDir, 'shared/util.ts', '')
    writeFile(tmpDir, 'tsconfig.json', `
{
  // Source roots are intentionally explicit.
  "include": [
    "src/**/*",
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": "src",
    "paths": {
      "@shared/*": [
        "shared/*",
      ],
      "@legacy/*": [
        "legacy/*",
      ],
    },
  },
}
`.trimStart())

    const findings = await caTsconfig001.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('compilerOptions.paths["@legacy/*"]')
  })

  it('checks named tsconfig variants like tsconfig.build.json', async () => {
    writeFile(tmpDir, 'src/index.ts', '')
    writeFile(tmpDir, 'tsconfig.build.json', JSON.stringify({
      include: ['src/**/*'],
      compilerOptions: { rootDir: 'dist' },
    }))

    const findings = await caTsconfig001.run(makeCtx(tmpDir))

    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('tsconfig.build.json')
    expect(findings[0].message).toContain('"compilerOptions.rootDir"')
  })

  it('returns no findings when no tsconfig files exist', async () => {
    expect(await caTsconfig001.run(makeCtx(tmpDir))).toHaveLength(0)
  })
})
