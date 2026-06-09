import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caConfig001 } from '../../src/rules/ca-config001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-config001-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(name: string, data: object): void {
    const full = path.join(tmpDir, 'config', name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(data));
}
function makeCtx(): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-CONFIG001', () => {
    it('returns no findings when fewer than 2 config files', async () => {
        writeConfig('development.json', { db: 'dev' });
        expect(await caConfig001.run(makeCtx())).toHaveLength(0);
    });

    it('flags a key present in development but missing from production', async () => {
        writeConfig('development.json', { db: 'dev', debug: true });
        writeConfig('production.json', { db: 'prod' });
        const findings = await caConfig001.run(makeCtx());
        expect(findings.some((f) => f.message.includes('"debug"'))).toBe(true);
    });

    it('returns no findings when all envs share all keys', async () => {
        writeConfig('development.json', { db: 'dev' });
        writeConfig('production.json', { db: 'prod' });
        expect(await caConfig001.run(makeCtx())).toHaveLength(0);
    });
});
