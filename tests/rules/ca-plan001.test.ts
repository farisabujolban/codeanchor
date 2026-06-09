import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caPlan001 } from '../../src/rules/ca-plan001.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-plan001-'));
}

function writeFile(dir: string, name: string, content: string): void {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(tmpDir: string, exclude: string[] = []): RuleContext {
    return {
        mode: 'repo',
        repoRoot: tmpDir,
        config: { exclude, rules: {} },
    };
}

describe('CA-PLAN001', () => {
    let tmpDir: string;
    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('passes when both model and intelligence are present', async () => {
        writeFile(
            tmpDir,
            'implementation-plan.md',
            ['---', 'model: claude-haiku-4-5', 'intelligence: low', '---', '', '# My Plan'].join('\n'),
        );
        const findings = await caPlan001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags missing model field', async () => {
        writeFile(tmpDir, 'implementation-plan.md', ['---', 'intelligence: medium', '---', '', '# My Plan'].join('\n'));
        const findings = await caPlan001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('"model"');
    });

    it('flags missing intelligence field', async () => {
        writeFile(
            tmpDir,
            'implementation-plan.md',
            ['---', 'model: claude-sonnet-4-6', '---', '', '# My Plan'].join('\n'),
        );
        const findings = await caPlan001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('"intelligence"');
    });

    it('flags both fields when no frontmatter at all', async () => {
        writeFile(tmpDir, 'plan.md', '# My Plan\n\nNo frontmatter here.\n');
        const findings = await caPlan001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
        const messages = findings.map((f) => f.message);
        expect(messages.some((m) => m.includes('"model"'))).toBe(true);
        expect(messages.some((m) => m.includes('"intelligence"'))).toBe(true);
    });

    it('ignores non-plan markdown files', async () => {
        writeFile(tmpDir, 'README.md', '# README\nNo frontmatter.\n');
        writeFile(tmpDir, 'docs/changelog.md', '# Changelog\n');
        const findings = await caPlan001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('skips excluded plan files', async () => {
        writeFile(tmpDir, 'plan.md', '# My Plan\nNo frontmatter.\n');
        const findings = await caPlan001.run(makeCtx(tmpDir, ['plan.md']));
        expect(findings).toHaveLength(0);
    });

    it('finds plan files in subdirectories', async () => {
        writeFile(tmpDir, '.claude/plans/my-feature-plan.md', '# Plan\nNo frontmatter.\n');
        const findings = await caPlan001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
        expect(findings[0].file).toBe('.claude/plans/my-feature-plan.md');
    });
});
