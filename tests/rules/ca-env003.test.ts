import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caEnv003 } from '../../src/rules/ca-env003.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-env003-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content = ''): void {
    fs.writeFileSync(path.join(tmpDir, name), content, 'utf-8');
}
function makeCtx(): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-ENV003', () => {
    it('returns no findings when no .env files exist', async () => {
        expect(await caEnv003.run(makeCtx())).toHaveLength(0);
    });

    it('flags .env not covered by .gitignore', async () => {
        writeFile('.env', 'SECRET=123');
        writeFile('.gitignore', '*.log\n');
        const findings = await caEnv003.run(makeCtx());
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('.env');
    });

    it('does not flag .env when covered by .gitignore', async () => {
        writeFile('.env', 'SECRET=123');
        writeFile('.gitignore', '.env\n');
        expect(await caEnv003.run(makeCtx())).toHaveLength(0);
    });

    it('does not flag .env when covered by .env* glob in .gitignore', async () => {
        writeFile('.env.local', 'SECRET=123');
        writeFile('.gitignore', '.env*\n');
        expect(await caEnv003.run(makeCtx())).toHaveLength(0);
    });

    it('does not flag .env.example (safe suffix)', async () => {
        writeFile('.env.example', 'SECRET=');
        expect(await caEnv003.run(makeCtx())).toHaveLength(0);
    });
});
