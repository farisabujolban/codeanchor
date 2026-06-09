import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caPkg004 } from '../../src/rules/ca-pkg004.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-pkg004-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writePkg(data: object): void {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(data, null, 2));
}
function makeCtx(): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-PKG004', () => {
    it('returns no findings when no package.json', async () => {
        expect(await caPkg004.run(makeCtx())).toHaveLength(0);
    });

    it('flags npm run call to undefined script', async () => {
        writePkg({ scripts: { build: 'npm run compile' } });
        const findings = await caPkg004.run(makeCtx());
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('"compile"');
    });

    it('does not flag npm run call to defined script', async () => {
        writePkg({ scripts: { compile: 'tsc', build: 'npm run compile' } });
        expect(await caPkg004.run(makeCtx())).toHaveLength(0);
    });

    it('returns no findings when no scripts field', async () => {
        writePkg({ name: 'foo' });
        expect(await caPkg004.run(makeCtx())).toHaveLength(0);
    });
});
