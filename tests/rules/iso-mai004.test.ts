import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoMai004 } from '../../src/rules/iso-mai004.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-mai004-'));
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
    execSync('git commit -m "add"', { cwd: dir });
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('ISO-MAI004', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- JS/TS ---

    it('flags a TS file with no test counterpart', async () => {
        writeAndCommit(tmpDir, { 'src/utils.ts': `export function add(a: number, b: number) { return a + b }` });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.file === 'src/utils.ts')).toBe(true);
        expect(findings[0].ruleId).toBe('ISO-MAI004');
    });

    it('does NOT flag when foo.test.ts exists', async () => {
        writeAndCommit(tmpDir, {
            'src/utils.ts': `export function add(a: number) { return a }`,
            'src/utils.test.ts': `import { add } from './utils'; test("x", () => expect(add(1)).toBe(1))`,
        });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.every((f) => f.file !== 'src/utils.ts')).toBe(true);
    });

    it('does NOT flag when foo.spec.ts exists', async () => {
        writeAndCommit(tmpDir, {
            'src/calc.ts': `export const x = 1`,
            'src/calc.spec.ts': `describe("calc", () => {})`,
        });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.every((f) => f.file !== 'src/calc.ts')).toBe(true);
    });

    it('does NOT flag when __tests__/foo.ts exists', async () => {
        writeAndCommit(tmpDir, {
            'src/parser.ts': `export const x = 1`,
            'src/__tests__/parser.ts': `describe("parser", () => {})`,
        });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.every((f) => f.file !== 'src/parser.ts')).toBe(true);
    });

    it('does NOT flag barrel index files', async () => {
        writeAndCommit(tmpDir, { 'src/index.ts': `export * from './utils'` });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.every((f) => f.file !== 'src/index.ts')).toBe(true);
    });

    it('does NOT flag .d.ts files', async () => {
        writeAndCommit(tmpDir, { 'src/types.d.ts': `export type Foo = string` });
        expect(await isoMai004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag test files themselves', async () => {
        writeAndCommit(tmpDir, {
            'src/utils.ts': `export const x = 1`,
            'src/utils.test.ts': `test("x", () => {})`,
        });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        // The test file itself should not appear in findings
        expect(findings.every((f) => !f.file.includes('.test.'))).toBe(true);
    });

    // --- Python ---

    it('flags a Python file with no test counterpart', async () => {
        writeAndCommit(tmpDir, { 'src/utils.py': `def add(a, b): return a + b` });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.file === 'src/utils.py')).toBe(true);
    });

    it('does NOT flag Python when test_utils.py exists', async () => {
        writeAndCommit(tmpDir, {
            'src/utils.py': `def add(a, b): return a + b`,
            'src/test_utils.py': `def test_add(): assert add(1,2)==3`,
        });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.every((f) => f.file !== 'src/utils.py')).toBe(true);
    });

    it('does NOT flag Python when utils_test.py exists', async () => {
        writeAndCommit(tmpDir, {
            'src/utils.py': `def add(a, b): return a + b`,
            'src/utils_test.py': `def test_add(): pass`,
        });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.every((f) => f.file !== 'src/utils.py')).toBe(true);
    });

    it('does NOT flag __init__.py', async () => {
        writeAndCommit(tmpDir, { 'pkg/__init__.py': `` });
        expect(await isoMai004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Java ---

    it('flags a Java file with no test counterpart', async () => {
        writeAndCommit(tmpDir, { 'src/Calculator.java': `public class Calculator {}` });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.file === 'src/Calculator.java')).toBe(true);
    });

    it('does NOT flag Java when CalculatorTest.java exists', async () => {
        writeAndCommit(tmpDir, {
            'src/Calculator.java': `public class Calculator {}`,
            'src/CalculatorTest.java': `public class CalculatorTest {}`,
        });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        expect(findings.every((f) => f.file !== 'src/Calculator.java')).toBe(true);
    });

    // --- Fix suggestion ---

    it('suggests a test file path in the fix message', async () => {
        writeAndCommit(tmpDir, { 'src/utils.ts': `export const x = 1` });
        const findings = await isoMai004.run(makeCtx(tmpDir));
        const f = findings.find((f) => f.file === 'src/utils.ts');
        expect(f?.fix).toBeDefined();
        expect(f?.fix).toContain('utils.test');
    });
});
