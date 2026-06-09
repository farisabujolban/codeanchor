import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoPor001 } from '../../src/rules/iso-por001.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-por001-'));
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

describe('ISO-POR001', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- Invalid cases ---

    it('flags Windows absolute path in JS string', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `const p = 'C:\\\\Users\\\\name\\\\file.txt'`);
        const findings = await isoPor001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-POR001');
        expect(findings[0].line).toBe(1);
        expect(findings[0].file).toBe('src/a.ts');
    });

    it('flags Windows path separator in path.join argument', async () => {
        writeAndCommit(tmpDir, 'src/b.js', `const p = path.join('dir', 'sub\\\\file.txt')`);
        const findings = await isoPor001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-POR001');
    });

    it('flags Windows path separator in Python string', async () => {
        writeAndCommit(tmpDir, 'load.py', `f = open('data\\\\input.csv')`);
        const findings = await isoPor001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].file).toBe('load.py');
    });

    it('flags double-quoted Windows path', async () => {
        writeAndCommit(tmpDir, 'src/c.ts', `const dir = "config\\\\settings.json"`);
        expect(await isoPor001.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('reports correct line number for second line', async () => {
        writeAndCommit(tmpDir, 'src/d.ts', `const x = 1\nconst p = 'sub\\\\file.txt'`);
        const findings = await isoPor001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].line).toBe(2);
    });

    // --- Valid cases ---

    it('does NOT flag forward-slash paths', async () => {
        writeAndCommit(tmpDir, 'src/e.ts', `const p = path.join('dir', 'sub/file.txt')`);
        expect(await isoPor001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag recognized escape sequences (\\n, \\t)', async () => {
        writeAndCommit(tmpDir, 'src/f.ts', `const s = 'hello\\nworld'\nconst t = '\\t indented'`);
        expect(await isoPor001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Windows path in a // comment', async () => {
        writeAndCommit(tmpDir, 'src/g.ts', `// old path was 'C:\\\\Users\\\\foo'`);
        expect(await isoPor001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python Windows path in a # comment', async () => {
        writeAndCommit(tmpDir, 'h.py', `# path = 'C:\\\\Users\\\\foo'`);
        expect(await isoPor001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag .md files', async () => {
        writeAndCommit(tmpDir, 'README.md', `Use 'C:\\\\Users\\\\name' on Windows.`);
        expect(await isoPor001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('flags \\\\d in a string (known limitation: cannot distinguish from path separator)', async () => {
        // \\d in source = two backslashes + d. The regex-based rule cannot distinguish
        // regex-style escapes from Windows path separators — this is an intentional limitation.
        writeAndCommit(tmpDir, 'src/i.ts', `const re = 'match\\\\d digits'`);
        const findings = await isoPor001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('does NOT flag Java file with only forward-slash paths', async () => {
        writeAndCommit(tmpDir, 'Main.java', `Path p = Paths.get("dir/sub/file.txt");`);
        expect(await isoPor001.run(makeCtx(tmpDir))).toHaveLength(0);
    });
});
