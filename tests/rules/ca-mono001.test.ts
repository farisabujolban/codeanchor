import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caMono001 } from '../../src/rules/ca-mono001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-mono001-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string): void {
    const full = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}
function makeCtx(): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-MONO001', () => {
    it('returns no findings when no workspace config', async () => {
        expect(await caMono001.run(makeCtx())).toHaveLength(0);
    });

    it('returns no findings when fewer than 2 workspace packages', async () => {
        writeFile('package.json', JSON.stringify({ workspaces: ['packages/*'] }));
        writeFile('packages/a/package.json', JSON.stringify({ dependencies: { lodash: '4.0.0' } }));
        expect(await caMono001.run(makeCtx())).toHaveLength(0);
    });

    it('flags mismatched dependency versions across workspaces', async () => {
        writeFile('package.json', JSON.stringify({ workspaces: ['packages/*'] }));
        writeFile('packages/a/package.json', JSON.stringify({ dependencies: { lodash: '4.0.0' } }));
        writeFile('packages/b/package.json', JSON.stringify({ dependencies: { lodash: '3.10.0' } }));
        const findings = await caMono001.run(makeCtx());
        expect(findings.some((f) => f.message.includes('lodash'))).toBe(true);
    });

    it('returns no findings when all packages use same version', async () => {
        writeFile('package.json', JSON.stringify({ workspaces: ['packages/*'] }));
        writeFile('packages/a/package.json', JSON.stringify({ dependencies: { lodash: '4.0.0' } }));
        writeFile('packages/b/package.json', JSON.stringify({ dependencies: { lodash: '4.0.0' } }));
        expect(await caMono001.run(makeCtx())).toHaveLength(0);
    });
});
