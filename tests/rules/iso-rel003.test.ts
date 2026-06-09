import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoRel003 } from '../../src/rules/iso-rel003.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-rel003-'));
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

describe('ISO-REL003', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- JS/TS: strict equality with float ---

    it('flags x === 0.5', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (result === 0.5) { return true }`);
        const findings = await isoRel003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-REL003');
        expect(findings[0].line).toBe(1);
    });

    it('flags x !== 3.14', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (x !== 3.14) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags float on the left: 0.5 === x', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (0.5 === x) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags loose equality: x == 1.5', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (x == 1.5) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags x != 2.7', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (x != 2.7) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag integer comparisons: x === 0', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (x === 0) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag x === 1.0 (fractional part is zero)', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (x === 1.0) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag x === 0.0', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (x === 0.0) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag x === 2 (integer)', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `if (x === 2) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag comparison in a comment', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `// if (x === 0.5) {}`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('reports correct line number on second line', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `const x = 1\nif (x === 0.5) {}`);
        const findings = await isoRel003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].line).toBe(2);
    });

    it('flags multiple float comparisons in one file', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            [
                `if (a === 0.1) {}`,
                `if (b !== 0.2) {}`,
                `if (c === 1.0) {}`, // should NOT flag this (1.0 has zero fraction)
            ].join('\n'),
        );
        const findings = await isoRel003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    // --- Python ---

    it('flags Python: x == 0.1', async () => {
        writeAndCommit(tmpDir, 'utils.py', `if x == 0.1:\n    pass`);
        const findings = await isoRel003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].file).toBe('utils.py');
    });

    it('flags Python: result != 3.14', async () => {
        writeAndCommit(tmpDir, 'utils.py', `if result != 3.14:\n    pass`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag Python: x == 0', async () => {
        writeAndCommit(tmpDir, 'utils.py', `if x == 0:\n    pass`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python float in # comment', async () => {
        writeAndCommit(tmpDir, 'utils.py', `# if x == 0.5: pass`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Java ---

    it('flags Java: x == 1.5f', async () => {
        writeAndCommit(tmpDir, 'Calc.java', `if (x == 1.5f) { return true; }`);
        const findings = await isoRel003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('flags Java: d != 3.14d', async () => {
        writeAndCommit(tmpDir, 'Calc.java', `if (d != 3.14d) { return; }`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag Java: x == 1 (integer)', async () => {
        writeAndCommit(tmpDir, 'Calc.java', `if (x == 1) { return; }`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Non-source files ---

    it('ignores .md files', async () => {
        writeAndCommit(tmpDir, 'README.md', `Use x === 0.5 for checking.`);
        expect(await isoRel003.run(makeCtx(tmpDir))).toHaveLength(0);
    });
});
