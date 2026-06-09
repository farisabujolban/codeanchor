import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caPublish001 } from '../../src/rules/ca-publish001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-pub001-'));
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

describe('CA-PUBLISH001', () => {
    it('returns no findings when no package.json', async () => {
        expect(await caPublish001.run(makeCtx())).toHaveLength(0);
    });

    it('returns no findings for private packages', async () => {
        writeFile('package.json', JSON.stringify({ private: true }));
        expect(await caPublish001.run(makeCtx())).toHaveLength(0);
    });

    it('flags when no files field and no .npmignore', async () => {
        writeFile('package.json', JSON.stringify({ name: 'foo', version: '1.0.0' }));
        const findings = await caPublish001.run(makeCtx());
        expect(findings.some((f) => f.ruleId === 'CA-PUBLISH001')).toBe(true);
    });

    it('does not flag when files field is present', async () => {
        writeFile('package.json', JSON.stringify({ name: 'foo', version: '1.0.0', files: ['dist'] }));
        const findings = await caPublish001.run(makeCtx());
        expect(findings.filter((f) => f.message.includes('files'))).toHaveLength(0);
    });
});
