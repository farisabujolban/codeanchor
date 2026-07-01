import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caLock002 } from '../../src/rules/ca-lock002.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-lock002-'));
}

function touch(dir: string, name: string): void {
    fs.writeFileSync(path.join(dir, name), '', 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-LOCK002', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when only package-lock.json is present', async () => {
        touch(tmpDir, 'package-lock.json');
        const findings = await caLock002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when only yarn.lock is present', async () => {
        touch(tmpDir, 'yarn.lock');
        const findings = await caLock002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when only pnpm-lock.yaml is present', async () => {
        touch(tmpDir, 'pnpm-lock.yaml');
        const findings = await caLock002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when no lockfile exists', async () => {
        const findings = await caLock002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags when package-lock.json and yarn.lock coexist', async () => {
        touch(tmpDir, 'package-lock.json');
        touch(tmpDir, 'yarn.lock');
        const findings = await caLock002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-LOCK002');
        expect(findings[0].message).toMatch(/package-lock\.json/);
        expect(findings[0].message).toMatch(/yarn\.lock/);
    });

    it('flags when package-lock.json and pnpm-lock.yaml coexist', async () => {
        touch(tmpDir, 'package-lock.json');
        touch(tmpDir, 'pnpm-lock.yaml');
        const findings = await caLock002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-LOCK002');
    });

    it('produces exactly one finding even when all three lockfiles are present', async () => {
        touch(tmpDir, 'package-lock.json');
        touch(tmpDir, 'yarn.lock');
        touch(tmpDir, 'pnpm-lock.yaml');
        const findings = await caLock002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].severity).toBe('error');
    });
});
