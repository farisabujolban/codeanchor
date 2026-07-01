import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caCi007 } from '../../src/rules/ca-ci007.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-ci007-'));
}

function writeWorkflow(dir: string, name: string, content: string): void {
    const full = path.join(dir, '.github', 'workflows', name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

const SHA = 'a81bbbf8298c0fa03ea29cdc473d45769f953675';
const SHA2 = '1a4442cacd436585916779262731145ded914f45';

describe('CA-CI007', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when no workflow directory exists', async () => {
        const findings = await caCi007.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for a version-tag ref (not a SHA)', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
steps:
  - uses: actions/checkout@v3
`,
        );
        const findings = await caCi007.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for a SHA pin with a version comment', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
steps:
  - uses: actions/checkout@${SHA}  # v3.0.2
`,
        );
        const findings = await caCi007.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags a SHA pin without any comment', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
steps:
  - uses: actions/checkout@${SHA}
`,
        );
        const findings = await caCi007.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-CI007');
        expect(findings[0].message).toMatch(/actions\/checkout/);
    });

    it('flags multiple uncommented SHA pins', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
steps:
  - uses: actions/checkout@${SHA}
  - uses: actions/setup-node@${SHA2}
`,
        );
        const findings = await caCi007.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('reports nothing for a short SHA (7-char — not a full commit SHA)', async () => {
        writeWorkflow(
            tmpDir,
            'ci.yml',
            `
steps:
  - uses: actions/checkout@a81bbbf
`,
        );
        const findings = await caCi007.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('includes the line number in the finding', async () => {
        writeWorkflow(tmpDir, 'ci.yml', `steps:\n  - uses: actions/checkout@${SHA}\n`);
        const findings = await caCi007.run(makeCtx(tmpDir));
        expect(findings[0].line).toBe(2);
    });
});
