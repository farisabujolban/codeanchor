import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoSec002 } from '../../src/rules/iso-sec002.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-sec002-'));
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

describe('ISO-SEC002', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- JS/TS: new RegExp ---

    it('flags new RegExp("(a+)+")', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `const re = new RegExp('(a+)+')`);
        const findings = await isoSec002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-SEC002');
        expect(findings[0].message).toContain('(a+)+');
    });

    it('flags new RegExp("(.*)+") ', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `const re = new RegExp("(.*)+")`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags new RegExp("([a-z]+)+")', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `const re = new RegExp('([a-z]+)+')`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag new RegExp("\\\\d+")', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `const re = new RegExp('\\d+')`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag new RegExp("[a-z]+")', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `const re = new RegExp('[a-z]+')`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag new RegExp("(a|b)")', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `const re = new RegExp('(a|b)')`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag ReDoS pattern in a comment', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `// const re = new RegExp('(a+)+') — dangerous!`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- JS/TS: inline regex literals ---

    it('flags inline regex (a+)+ after assignment', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `const re = /(a+)+/g`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags inline regex (.*)*+ in .test() context', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `if (/(.*)+/.test(input)) {}`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag safe regex /^[a-z]+$/ in .test() context', async () => {
        writeAndCommit(tmpDir, 'src/validate.ts', `if (/^[a-z]+$/.test(input)) {}`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Python ---

    it('flags Python re.compile(r"(a+)+")', async () => {
        writeAndCommit(tmpDir, 'utils.py', `import re\npattern = re.compile(r'(a+)+')`);
        const findings = await isoSec002.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.file === 'utils.py')).toBe(true);
    });

    it('flags Python re.match(r"(.*)+", ...)', async () => {
        writeAndCommit(tmpDir, 'utils.py', `import re\nre.match(r'(.*)+', text)`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag Python re.compile(r"\\d+")', async () => {
        writeAndCommit(tmpDir, 'utils.py', `import re\npattern = re.compile(r'\\d+')`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python ReDoS in # comment', async () => {
        writeAndCommit(tmpDir, 'utils.py', `# re.compile(r'(a+)+')\n`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Java ---

    it('flags Java Pattern.compile("([a-z]+)+")', async () => {
        writeAndCommit(tmpDir, 'Validator.java', `Pattern p = Pattern.compile("([a-z]+)+");`);
        const findings = await isoSec002.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.file === 'Validator.java')).toBe(true);
    });

    it('flags Java str.matches("(a+)+")', async () => {
        writeAndCommit(tmpDir, 'Validator.java', `boolean ok = str.matches("(a+)+");`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag Java Pattern.compile("[a-z]+")', async () => {
        writeAndCommit(tmpDir, 'Validator.java', `Pattern p = Pattern.compile("[a-z]+");`);
        expect(await isoSec002.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('reports the correct line number', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `const x = 1\nconst re = new RegExp('(a+)+')`);
        const findings = await isoSec002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].line).toBe(2);
    });
});
