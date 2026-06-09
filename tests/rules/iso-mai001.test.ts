import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoMai001 } from '../../src/rules/iso-mai001.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-mai001-'));
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    execSync('git config commit.gpgsign false', { cwd: dir });
    return dir;
}

function writeAndCommit(dir: string, files: Record<string, string>): void {
    for (const [relPath, content] of Object.entries(files)) {
        const abs = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf-8');
    }
    execSync('git add -A', { cwd: dir });
    execSync('git commit -m "add files"', { cwd: dir });
}

function makeCtx(dir: string, exclude: string[] = []): RuleContext {
    return {
        mode: 'repo',
        repoRoot: dir,
        config: { exclude, rules: {} },
    };
}

describe('ISO-MAI001', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- Two-file cycle ---

    it('detects a two-file JS cycle', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import { b } from './b'`,
            'src/b.ts': `import { a } from './a'`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
        expect(findings.map((f) => f.ruleId).every((id) => id === 'ISO-MAI001')).toBe(true);
        const files = findings.map((f) => f.file).sort();
        expect(files).toEqual(['src/a.ts', 'src/b.ts']);
        expect(findings[0].message).toContain('→');
    });

    it('detects a three-file cycle', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import {} from './b'`,
            'src/b.ts': `import {} from './c'`,
            'src/c.ts': `import {} from './a'`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(3);
        const files = findings.map((f) => f.file).sort();
        expect(files).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    });

    it('finds no cycle in a linear chain', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import {} from './b'`,
            'src/b.ts': `import {} from './c'`,
            'src/c.ts': `export const x = 1`,
        });
        expect(await isoMai001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('finds no cycle in a diamond (shared dependency)', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import {} from './b'; import {} from './c'`,
            'src/b.ts': `import {} from './d'`,
            'src/c.ts': `import {} from './d'`,
            'src/d.ts': `export const x = 1`,
        });
        expect(await isoMai001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('deduplicates the same cycle across different entry points', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import {} from './b'`,
            'src/b.ts': `import {} from './a'`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir));
        // Should report 2 findings (one per file in the cycle), not 4
        expect(findings).toHaveLength(2);
    });

    // --- Extension resolution ---

    it('resolves .ts extension when import omits it', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import {} from './b'`,
            'src/b.ts': `import {} from './a'`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('resolves index.ts barrel imports', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import {} from './utils'`,
            'src/utils/index.ts': `import {} from '../a'`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('ignores absolute/package imports', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import React from 'react'; import {} from 'lodash'`,
        });
        expect(await isoMai001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('ignores imports to non-tracked files', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import {} from './nonexistent'`,
        });
        expect(await isoMai001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- require() and dynamic import ---

    it('detects cycle via require()', async () => {
        writeAndCommit(tmpDir, {
            'src/a.js': `const b = require('./b')`,
            'src/b.js': `const a = require('./a')`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('detects cycle via dynamic import()', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `const b = import('./b')`,
            'src/b.ts': `const a = import('./a')`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    // --- Exclusion ---

    it('does not report excluded files', async () => {
        writeAndCommit(tmpDir, {
            'src/a.ts': `import {} from './b'`,
            'src/b.ts': `import {} from './a'`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir, ['src/a.ts']));
        // a is excluded, so the cycle goes unreported for a (but b is still in it)
        expect(findings.every((f) => f.file !== 'src/a.ts')).toBe(true);
    });

    // --- Python ---

    it('detects a Python relative import cycle', async () => {
        writeAndCommit(tmpDir, {
            'pkg/a.py': `from . import b`,
            'pkg/b.py': `from . import a`,
        });
        const findings = await isoMai001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
        const files = findings.map((f) => f.file).sort();
        expect(files).toEqual(['pkg/a.py', 'pkg/b.py']);
    });

    it('ignores Python absolute imports', async () => {
        writeAndCommit(tmpDir, {
            'pkg/a.py': `import os\nimport json`,
            'pkg/b.py': `import sys`,
        });
        expect(await isoMai001.run(makeCtx(tmpDir))).toHaveLength(0);
    });
});
