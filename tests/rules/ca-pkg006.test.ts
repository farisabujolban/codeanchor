import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caPkg006 } from '../../src/rules/ca-pkg006.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-pkg006-'));
}

function writeFile(dir: string, name: string, content: string): void {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-PKG006', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when no package.json exists', async () => {
        const findings = await caPkg006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when package.json has no types or typings field', async () => {
        writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'my-pkg', version: '1.0.0' }));
        const findings = await caPkg006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when types field points to an existing file', async () => {
        writeFile(tmpDir, 'dist/index.d.ts', '');
        writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'my-pkg', types: 'dist/index.d.ts' }));
        const findings = await caPkg006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags when types field points to a missing file', async () => {
        writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'my-pkg', types: 'dist/index.d.ts' }));
        const findings = await caPkg006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-PKG006');
        expect(findings[0].message).toMatch(/types/);
        expect(findings[0].message).toMatch(/dist\/index\.d\.ts/);
    });

    it('flags when typings field points to a missing file', async () => {
        writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'my-pkg', typings: 'dist/types.d.ts' }));
        const findings = await caPkg006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-PKG006');
        expect(findings[0].message).toMatch(/dist\/types\.d\.ts/);
    });

    it('reports nothing when typings field points to an existing file', async () => {
        writeFile(tmpDir, 'dist/types.d.ts', '');
        writeFile(tmpDir, 'package.json', JSON.stringify({ name: 'my-pkg', typings: 'dist/types.d.ts' }));
        const findings = await caPkg006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags both types and typings when both are missing', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                name: 'my-pkg',
                types: 'dist/index.d.ts',
                typings: 'dist/types.d.ts',
            }),
        );
        const findings = await caPkg006.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });
});
