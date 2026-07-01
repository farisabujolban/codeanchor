import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caPkg005 } from '../../src/rules/ca-pkg005.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-pkg005-'));
}

function writeFile(dir: string, name: string, content: string): void {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(tmpDir: string): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-PKG005', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns no findings when all deps are pinned', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                dependencies: { express: '4.18.2' },
                devDependencies: { vitest: '1.0.0' },
            }),
        );
        expect(await caPkg005.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('flags caret range in dependencies', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                dependencies: { express: '^4.18.2' },
            }),
        );
        const findings = await caPkg005.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-PKG005');
        expect(findings[0].message).toContain('^4.18.2');
        expect(findings[0].message).toContain('express');
    });

    it('flags tilde range in devDependencies', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                devDependencies: { vitest: '~1.0.0' },
            }),
        );
        const findings = await caPkg005.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('~1.0.0');
    });

    it('flags wildcard *', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                dependencies: { lodash: '*' },
            }),
        );
        const findings = await caPkg005.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('"*"');
    });

    it('flags "latest" tag', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                dependencies: { react: 'latest' },
            }),
        );
        const findings = await caPkg005.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('latest');
    });

    it('does not flag workspace: protocol', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                dependencies: { '@myorg/shared': 'workspace:*' },
            }),
        );
        expect(await caPkg005.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag file: protocol', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                dependencies: { local: 'file:../local-pkg' },
            }),
        );
        expect(await caPkg005.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag peerDependencies', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                peerDependencies: { react: '^18.0.0' },
            }),
        );
        expect(await caPkg005.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('reports the correct line number', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify(
                {
                    dependencies: {
                        express: '4.18.2',
                        lodash: '^4.17.21',
                    },
                },
                null,
                2,
            ),
        );
        const findings = await caPkg005.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].line).toBeGreaterThan(0);
    });

    it('returns no findings when package.json is absent', async () => {
        expect(await caPkg005.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('skips if staged mode and package.json not in staged diffs', async () => {
        writeFile(
            tmpDir,
            'package.json',
            JSON.stringify({
                dependencies: { lodash: '^4.17.21' },
            }),
        );
        const ctx: RuleContext = {
            mode: 'staged',
            repoRoot: tmpDir,
            config: { exclude: [], rules: {} },
            stagedDiffs: [{ path: 'src/index.ts', status: 'modified', changedLines: new Set() }],
        };
        expect(await caPkg005.run(ctx)).toHaveLength(0);
    });
});
