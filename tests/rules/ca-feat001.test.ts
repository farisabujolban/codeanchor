import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caFeat001 } from '../../src/rules/ca-feat001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-feat001-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string): void {
    const full = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}
function makeCtx(configFile?: string): RuleContext {
    return {
        mode: 'repo',
        repoRoot: tmpDir,
        config: {
            exclude: [],
            rules: configFile ? { 'CA-FEAT001': { configFile } } : {},
        },
    };
}

describe('CA-FEAT001', () => {
    it('returns no findings when configFile not in rule config (opt-in rule)', async () => {
        writeFile('src/app.ts', `flags.isEnabled('new-ui')`);
        expect(await caFeat001.run(makeCtx())).toHaveLength(0);
    });

    it('flags a flag key used in code but missing from config', async () => {
        writeFile('flags.json', JSON.stringify(['known-flag']));
        writeFile('src/app.ts', `flags.isEnabled('unknown-flag')`);
        const findings = await caFeat001.run(makeCtx('flags.json'));
        expect(findings.some((f) => f.message.includes('unknown-flag'))).toBe(true);
    });

    it('does not flag a flag key that exists in config', async () => {
        writeFile('flags.json', JSON.stringify(['known-flag']));
        writeFile('src/app.ts', `flags.isEnabled('known-flag')`);
        expect(await caFeat001.run(makeCtx('flags.json'))).toHaveLength(0);
    });
});
