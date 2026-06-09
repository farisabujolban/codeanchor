import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caPkg003 } from '../../src/rules/ca-pkg003.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-pkg003-'));
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

describe('CA-PKG003', () => {
    it('returns no findings when no package.json', async () => {
        expect(await caPkg003.run(makeCtx())).toHaveLength(0);
    });

    it('flags exports path not covered by files', async () => {
        writePkg({
            files: ['dist/index.js'],
            exports: { '.': './dist/index.js', './extra': './dist/extra.js' },
        });
        const findings = await caPkg003.run(makeCtx());
        expect(findings.some((f) => f.message.includes('./dist/extra.js'))).toBe(true);
    });

    it('does not flag when exports path is covered by files', async () => {
        writePkg({
            files: ['dist/**'],
            exports: { '.': './dist/index.js' },
        });
        expect(await caPkg003.run(makeCtx())).toHaveLength(0);
    });

    it('returns no findings when no exports field', async () => {
        writePkg({ files: ['dist/**'], main: './dist/index.js' });
        expect(await caPkg003.run(makeCtx())).toHaveLength(0);
    });
});
