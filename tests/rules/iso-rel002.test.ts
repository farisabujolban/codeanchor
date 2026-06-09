import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoRel002 } from '../../src/rules/iso-rel002.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-rel002-'));
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

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('ISO-REL002', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- JS/TS: named function declaration ---

    it('flags a named function declaration that calls itself', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `
function factorial(n: number): number {
  if (n <= 1) return 1
  return n * factorial(n - 1)
}
`,
        );
        const findings = await isoRel002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-REL002');
        expect(findings[0].message).toContain('factorial');
    });

    it('does NOT flag a function that calls a different function', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `
function double(n: number): number {
  return multiply(n, 2)
}
function multiply(a: number, b: number): number {
  return a * b
}
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag a method call obj.factorial() (method on object)', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `
function factorial(n: number): number {
  return helper.factorial(n - 1)
}
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- JS/TS: named arrow/function expressions ---

    it('flags a const arrow function that calls itself', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `
const fib = (n: number): number => {
  if (n <= 1) return n
  return fib(n - 1) + fib(n - 2)
}
`,
        );
        const findings = await isoRel002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('fib');
    });

    it('flags a const function expression that calls itself', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `
const countdown = function countdown(n: number): void {
  if (n > 0) countdown(n - 1)
}
`,
        );
        const findings = await isoRel002.run(makeCtx(tmpDir));
        expect(findings.length).toBeGreaterThanOrEqual(1);
        expect(findings.every((f) => f.ruleId === 'ISO-REL002')).toBe(true);
    });

    it('does NOT flag a function name appearing only in a string', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `
function factorial(n: number): number {
  const name = 'factorial'
  return 1
}
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag a function name appearing only in a comment', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `
function factorial(n: number): number {
  // factorial would recurse here but we don't
  return 1
}
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('reports the line of the recursive call, not the function definition', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `function fact(n: number): number {\n  if (n <= 1) return 1\n  return n * fact(n - 1)\n}`,
        );
        const findings = await isoRel002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].line).toBe(3);
    });

    it('flags multiple separate recursive functions in one file', async () => {
        writeAndCommit(
            tmpDir,
            'src/math.ts',
            `
function factorial(n: number): number {
  if (n <= 1) return 1
  return n * factorial(n - 1)
}

function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}
`,
        );
        const findings = await isoRel002.run(makeCtx(tmpDir));
        expect(findings.length).toBeGreaterThanOrEqual(2);
    });

    // --- Python ---

    it('flags a Python def that calls itself', async () => {
        writeAndCommit(
            tmpDir,
            'math_utils.py',
            `
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
`,
        );
        const findings = await isoRel002.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.file === 'math_utils.py')).toBe(true);
        expect(findings[0].ruleId).toBe('ISO-REL002');
    });

    it('does NOT flag a Python function calling a different function', async () => {
        writeAndCommit(
            tmpDir,
            'math_utils.py',
            `
def double(n):
    return multiply(n, 2)
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python method call obj.factorial()', async () => {
        writeAndCommit(
            tmpDir,
            'math_utils.py',
            `
def factorial(n):
    return helper.factorial(n - 1)
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python recursion name in a # comment', async () => {
        writeAndCommit(
            tmpDir,
            'math_utils.py',
            `
def factorial(n):
    # factorial is called recursively
    return 1
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Java ---

    it('flags a Java method that calls itself', async () => {
        writeAndCommit(
            tmpDir,
            'MathHelper.java',
            `
public class MathHelper {
  public static int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
  }
}
`,
        );
        const findings = await isoRel002.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.file === 'MathHelper.java')).toBe(true);
        expect(findings[0].ruleId).toBe('ISO-REL002');
    });

    it('does NOT flag Java method calling a different method', async () => {
        writeAndCommit(
            tmpDir,
            'MathHelper.java',
            `
public class MathHelper {
  public int factorial(int n) {
    return multiply(n, n - 1);
  }
  private int multiply(int a, int b) { return a * b; }
}
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Java method call obj.factorial()', async () => {
        writeAndCommit(
            tmpDir,
            'MathHelper.java',
            `
public class MathHelper {
  public int factorial(int n) {
    return helper.factorial(n - 1);
  }
}
`,
        );
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Non-source files ---

    it('ignores .md files', async () => {
        writeAndCommit(tmpDir, 'README.md', `function factorial(n) { return factorial(n-1) }`);
        expect(await isoRel002.run(makeCtx(tmpDir))).toHaveLength(0);
    });
});
