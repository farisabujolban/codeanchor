import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caCi006 } from '../../src/rules/ca-ci006.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-ci006-'));
}

function writeWorkflow(dir: string, name: string, content: string): void {
    const full = path.join(dir, '.github', 'workflows', name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-CI006', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when no workflow directory exists', async () => {
        const findings = await caCi006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when no permissions field is present', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
`,
        );
        const findings = await caCi006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for permissions: read-all', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
permissions: read-all
on: push
`,
        );
        const findings = await caCi006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for scoped permissions', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
permissions:
  contents: read
  issues: write
`,
        );
        const findings = await caCi006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags permissions: write-all at workflow root', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
permissions: write-all
on: push
`,
        );
        const findings = await caCi006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-CI006');
        expect(findings[0].severity).toBe('error');
    });

    it('flags permissions: write-all at job level', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: write-all
    steps:
      - run: echo hello
`,
        );
        const findings = await caCi006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toMatch(/write-all/);
    });

    it('produces one finding per write-all occurrence across jobs', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
on: push
jobs:
  job1:
    permissions: write-all
    runs-on: ubuntu-latest
    steps: []
  job2:
    permissions: write-all
    runs-on: ubuntu-latest
    steps: []
`,
        );
        const findings = await caCi006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('ignores write-all in a comment', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
# permissions: write-all
on: push
`,
        );
        const findings = await caCi006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });
});
