import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoSec001 } from '../../src/rules/iso-sec001.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-sec001-'));
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

describe('ISO-SEC001', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- JS/TS: Node.js crypto ---

    it('flags createHash("md5")', async () => {
        writeAndCommit(
            tmpDir,
            'src/hash.ts',
            `
import crypto from 'crypto'
const hash = crypto.createHash('md5')
`,
        );
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-SEC001');
        expect(findings[0].message).toContain('MD5');
    });

    it('flags createHash("sha1")', async () => {
        writeAndCommit(tmpDir, 'src/hash.ts', `const h = createHash("sha1")`);
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('SHA-1'))).toBe(true);
    });

    it('flags createHash("sha-1")', async () => {
        writeAndCommit(tmpDir, 'src/hash.ts', `const h = createHash("sha-1")`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags createCipheriv("des", ...)', async () => {
        writeAndCommit(tmpDir, 'src/enc.ts', `const c = createCipheriv('des', key, iv)`);
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('DES'))).toBe(true);
    });

    it('flags createCipheriv("rc4", ...)', async () => {
        writeAndCommit(tmpDir, 'src/enc.ts', `const c = createCipheriv('rc4', key, '')`);
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('RC4'))).toBe(true);
    });

    it('does NOT flag createHash("sha256")', async () => {
        writeAndCommit(tmpDir, 'src/hash.ts', `const h = createHash('sha256')`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag createHash("sha512")', async () => {
        writeAndCommit(tmpDir, 'src/hash.ts', `const h = createHash("sha512")`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag createCipheriv("aes-256-gcm", ...)', async () => {
        writeAndCommit(tmpDir, 'src/enc.ts', `const c = createCipheriv('aes-256-gcm', key, iv)`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag weak algo name in a comment', async () => {
        writeAndCommit(tmpDir, 'src/hash.ts', `// createHash('md5') — do not use`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('flags require("md5")', async () => {
        writeAndCommit(tmpDir, 'src/hash.js', `const md5 = require('md5')`);
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('MD5'))).toBe(true);
    });

    // --- Python: hashlib ---

    it('flags hashlib.md5(', async () => {
        writeAndCommit(tmpDir, 'utils.py', `import hashlib\nh = hashlib.md5(data)`);
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('MD5'))).toBe(true);
    });

    it('flags hashlib.sha1(', async () => {
        writeAndCommit(tmpDir, 'utils.py', `import hashlib\nh = hashlib.sha1(data)`);
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('SHA-1'))).toBe(true);
    });

    it('flags hashlib.new("md5", ...)', async () => {
        writeAndCommit(tmpDir, 'utils.py', `import hashlib\nh = hashlib.new('md5', data)`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag hashlib.sha256(', async () => {
        writeAndCommit(tmpDir, 'utils.py', `import hashlib\nh = hashlib.sha256(data)`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python md5 in # comment', async () => {
        writeAndCommit(tmpDir, 'utils.py', `# h = hashlib.md5(data)`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Java: JCA ---

    it('flags MessageDigest.getInstance("MD5")', async () => {
        writeAndCommit(
            tmpDir,
            'Hasher.java',
            `
public class Hasher {
  public byte[] hash(byte[] data) throws Exception {
    MessageDigest md = MessageDigest.getInstance("MD5");
    return md.digest(data);
  }
}
`,
        );
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('MD5'))).toBe(true);
    });

    it('flags MessageDigest.getInstance("SHA-1")', async () => {
        writeAndCommit(tmpDir, 'Hasher.java', `MessageDigest md = MessageDigest.getInstance("SHA-1");`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags Cipher.getInstance("DES")', async () => {
        writeAndCommit(tmpDir, 'Enc.java', `Cipher c = Cipher.getInstance("DES");`);
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('DES'))).toBe(true);
    });

    it('flags Cipher.getInstance("DES/ECB/PKCS5Padding")', async () => {
        writeAndCommit(tmpDir, 'Enc.java', `Cipher c = Cipher.getInstance("DES/ECB/PKCS5Padding");`);
        const findings = await isoSec001.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.message.includes('DES'))).toBe(true);
    });

    it('does NOT flag MessageDigest.getInstance("SHA-256")', async () => {
        writeAndCommit(tmpDir, 'Hasher.java', `MessageDigest md = MessageDigest.getInstance("SHA-256");`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Cipher.getInstance("AES/GCM/NoPadding")', async () => {
        writeAndCommit(tmpDir, 'Enc.java', `Cipher c = Cipher.getInstance("AES/GCM/NoPadding");`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Non-source files ---

    it('ignores .md files', async () => {
        writeAndCommit(tmpDir, 'README.md', `createHash('md5') is weak.`);
        expect(await isoSec001.run(makeCtx(tmpDir))).toHaveLength(0);
    });
});
