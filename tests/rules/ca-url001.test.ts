import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { caUrl001 } from '../../src/rules/ca-url001.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-url001-'));
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    execSync('git config commit.gpgsign false', { cwd: dir });
    return dir;
}

function writeAndCommit(dir: string, relPath: string, content: string): void {
    const abs = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    execSync('git add -A', { cwd: dir });
    execSync('git commit -m "add"', { cwd: dir });
}

function writeFileNoCommit(dir: string, relPath: string, content: string): void {
    const abs = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-URL001', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('flags http://localhost in a TS source file', async () => {
        writeAndCommit(
            tmpDir,
            'src/api.ts',
            `
const BASE = 'http://localhost:3000/api';
`,
        );
        const findings = await caUrl001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-URL001');
        expect(findings[0].message).toContain('http://localhost:3000');
        expect(findings[0].file).toBe('src/api.ts');
    });

    it('flags https://localhost in a JS file', async () => {
        writeAndCommit(tmpDir, 'src/client.js', `const url = 'https://localhost:8080';`);
        const findings = await caUrl001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('https://localhost');
    });

    it('flags http://127.0.0.1', async () => {
        writeAndCommit(tmpDir, 'src/service.ts', `fetch('http://127.0.0.1:4000/health');`);
        const findings = await caUrl001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('127.0.0.1');
    });

    it('does not flag localhost in a test file', async () => {
        writeAndCommit(
            tmpDir,
            'src/api.test.ts',
            `
const BASE = 'http://localhost:3000';
`,
        );
        expect(await caUrl001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag localhost in a spec file', async () => {
        writeAndCommit(tmpDir, 'src/api.spec.ts', `const url = 'http://localhost:3000';`);
        expect(await caUrl001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag localhost in a __tests__ directory', async () => {
        writeAndCommit(tmpDir, 'src/__tests__/api.ts', `const url = 'http://localhost:3000';`);
        expect(await caUrl001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag localhost in a // comment', async () => {
        writeAndCommit(
            tmpDir,
            'src/api.ts',
            `
// see http://localhost:3000 for local dev
const x = 1;
`,
        );
        expect(await caUrl001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag localhost in a block comment', async () => {
        writeAndCommit(
            tmpDir,
            'src/api.ts',
            `
/* connect to http://localhost:3000 */
const x = 1;
`,
        );
        expect(await caUrl001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('flags localhost in a Python file', async () => {
        writeAndCommit(tmpDir, 'src/client.py', `BASE_URL = "http://localhost:8000/api"`);
        const findings = await caUrl001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].file).toBe('src/client.py');
    });

    it('does not flag localhost in a Python comment', async () => {
        writeAndCommit(tmpDir, 'src/client.py', `# dev server: http://localhost:8000\nx = 1`);
        expect(await caUrl001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag non-source files', async () => {
        writeAndCommit(tmpDir, 'README.md', `Run locally at http://localhost:3000`);
        expect(await caUrl001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('reports one finding per line even with multiple URLs on the same line', async () => {
        writeAndCommit(tmpDir, 'src/api.ts', `const urls = ['http://localhost:3000', 'http://localhost:4000'];`);
        const findings = await caUrl001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('works in staged mode via stagedDiffs', async () => {
        writeFileNoCommit(tmpDir, 'src/api.ts', `const BASE = 'http://localhost:3000';`);
        const ctx: RuleContext = {
            mode: 'staged',
            repoRoot: tmpDir,
            config: { exclude: [], rules: {} },
            stagedDiffs: [{ path: 'src/api.ts', status: 'modified', changedLines: new Set() }],
        };
        const findings = await caUrl001.run(ctx);
        expect(findings).toHaveLength(1);
    });
});
