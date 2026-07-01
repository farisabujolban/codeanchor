import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caEnv004 } from '../../src/rules/ca-env004.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-env004-'));
}

function writeEnvExample(dir: string, content: string): void {
    fs.writeFileSync(path.join(dir, '.env.example'), content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-ENV004', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when no .env.example exists', async () => {
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for placeholder values with "your"', async () => {
        writeEnvExample(tmpDir, 'API_KEY=your-api-key-here\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for angle-bracket placeholders', async () => {
        writeEnvExample(tmpDir, 'SECRET=<your-secret>\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for empty values', async () => {
        writeEnvExample(tmpDir, 'JWT_SECRET=\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for non-credential key with any value', async () => {
        writeEnvExample(tmpDir, 'PORT=3000\nNODE_ENV=development\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for comment lines', async () => {
        writeEnvExample(tmpDir, '# This is a comment\nAPI_KEY=your-key\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for values with "example" in them', async () => {
        writeEnvExample(tmpDir, 'SECRET=example-secret-value\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags a real-looking API key', async () => {
        writeEnvExample(tmpDir, 'API_KEY=sk-proj-xK9mNpLqRsTuVwXyZ1a2b3\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-ENV004');
        expect(findings[0].message).toMatch(/API_KEY/);
    });

    it('flags a JWT-prefixed value (eyJ...)', async () => {
        writeEnvExample(tmpDir, 'JWT_SECRET=eyJhbGciOiJIUzI1NiJ9.realtoken.abc\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-ENV004');
    });

    it('flags a password that looks real', async () => {
        writeEnvExample(tmpDir, 'DATABASE_PASSWORD=ActualPa$$w0rd99\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('flags multiple real-looking credentials', async () => {
        writeEnvExample(tmpDir, 'API_KEY=sk-realkey123456\nSECRET=xK9mNpLqRsTuVw\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('reports nothing for $ variable references', async () => {
        writeEnvExample(tmpDir, 'API_KEY=$SOME_OTHER_VAR\n');
        const findings = await caEnv004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });
});
