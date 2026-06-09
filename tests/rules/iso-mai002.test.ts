import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoMai002 } from '../../src/rules/iso-mai002.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-mai002-'));
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
    execSync(`git commit -m "add ${relPath}"`, { cwd: dir });
}

function makeCtx(dir: string, threshold?: number): RuleContext {
    return {
        mode: 'repo',
        repoRoot: dir,
        config: {
            exclude: [],
            rules: threshold !== undefined ? { 'ISO-MAI002': { threshold } as never } : {},
        },
    };
}

describe('ISO-MAI002', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- JS/TS ---

    it('finds no finding for file under threshold', async () => {
        writeAndCommit(
            tmpDir,
            'src/utils.ts',
            `
export const a = 1
export const b = 2
export function c() {}
export class D {}
`,
        );
        const findings = await isoMai002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('finds a finding when exports exceed default threshold (10)', async () => {
        const exports = Array.from({ length: 11 }, (_, i) => `export const v${i} = ${i}`).join('\n');
        writeAndCommit(tmpDir, 'src/many.ts', exports);
        const findings = await isoMai002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-MAI002');
        expect(findings[0].file).toBe('src/many.ts');
        expect(findings[0].message).toContain('11 public symbols');
    });

    it('respects custom threshold', async () => {
        const exports = Array.from({ length: 6 }, (_, i) => `export const v${i} = ${i}`).join('\n');
        writeAndCommit(tmpDir, 'src/file.ts', exports);
        expect(await isoMai002.run(makeCtx(tmpDir, 5))).toHaveLength(1);
        expect(await isoMai002.run(makeCtx(tmpDir, 6))).toHaveLength(0);
    });

    it('counts export { A, B, C } block symbols', async () => {
        writeAndCommit(
            tmpDir,
            'src/re-export.ts',
            `
const a = 1, b = 2, c = 3, d = 4, e = 5, f = 6, g = 7, h = 8, i = 9, j = 10, k = 11
export { a, b, c, d, e, f, g, h, i, j, k }
`,
        );
        const findings = await isoMai002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('11 public symbols');
    });

    it('counts export type { ... } symbols', async () => {
        const types = Array.from({ length: 11 }, (_, i) => `type T${i} = string`).join('\n');
        const exportLine = `export type { ${Array.from({ length: 11 }, (_, i) => `T${i}`).join(', ')} }`;
        writeAndCommit(tmpDir, 'src/types.ts', `${types}\n${exportLine}`);
        const findings = await isoMai002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('counts export default as 1', async () => {
        const exports = Array.from({ length: 10 }, (_, i) => `export const v${i} = ${i}`).join('\n');
        writeAndCommit(tmpDir, 'src/file.ts', `${exports}\nexport default {}`);
        const findings = await isoMai002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('11 public symbols');
    });

    it('skips index.ts barrel files', async () => {
        const exports = Array.from({ length: 20 }, (_, i) => `export const v${i} = ${i}`).join('\n');
        writeAndCommit(tmpDir, 'src/index.ts', exports);
        expect(await isoMai002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('skips .d.ts declaration files', async () => {
        const exports = Array.from({ length: 20 }, (_, i) => `export const v${i}: number`).join('\n');
        writeAndCommit(tmpDir, 'src/types.d.ts', exports);
        expect(await isoMai002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('counts export * from as 1', async () => {
        const exports = Array.from({ length: 10 }, (_, i) => `export * from './mod${i}'`).join('\n');
        writeAndCommit(tmpDir, 'src/bundle.ts', `export const x = 1\n${exports}`);
        const findings = await isoMai002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('11 public symbols');
    });

    // --- Python ---

    it('counts public Python defs and flags when over threshold', async () => {
        const defs = Array.from({ length: 11 }, (_, i) => `def func${i}():\n    pass`).join('\n\n');
        writeAndCommit(tmpDir, 'utils.py', defs);
        const findings = await isoMai002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].file).toBe('utils.py');
    });

    it('does not count Python private defs (underscore prefix)', async () => {
        const defs = [
            ...Array.from({ length: 8 }, (_, i) => `def pub${i}():\n    pass`),
            ...Array.from({ length: 5 }, (_, i) => `def _priv${i}():\n    pass`),
        ].join('\n\n');
        writeAndCommit(tmpDir, 'utils.py', defs);
        expect(await isoMai002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('skips __init__.py', async () => {
        const defs = Array.from({ length: 20 }, (_, i) => `def f${i}():\n    pass`).join('\n\n');
        writeAndCommit(tmpDir, 'pkg/__init__.py', defs);
        expect(await isoMai002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Java ---

    it('flags Java file with more than 1 public class', async () => {
        writeAndCommit(
            tmpDir,
            'src/Pair.java',
            `
public class Pair {
    public int first;
    public int second;
}

class Helper {}

public class Triple {
    public int a, b, c;
}
`,
        );
        const findings = await isoMai002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].file).toBe('src/Pair.java');
        expect(findings[0].message).toContain('2 public symbols');
    });

    it('finds no finding for Java file with 1 public class', async () => {
        writeAndCommit(
            tmpDir,
            'src/Foo.java',
            `
public class Foo {
    private class Inner {}
}
`,
        );
        expect(await isoMai002.run(makeCtx(tmpDir))).toHaveLength(0);
    });
});
