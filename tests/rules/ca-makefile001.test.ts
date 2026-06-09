import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caMakefile001 } from '../../src/rules/ca-makefile001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-make001-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeMakefile(content: string): void {
    fs.writeFileSync(path.join(tmpDir, 'Makefile'), content, 'utf-8');
}
function makeCtx(): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-MAKEFILE001', () => {
    it('returns no findings when no Makefile exists', async () => {
        expect(await caMakefile001.run(makeCtx())).toHaveLength(0);
    });

    it('flags $(MAKE) call to undefined target', async () => {
        writeMakefile('build:\n\t$(MAKE) missing-target\n');
        const findings = await caMakefile001.run(makeCtx());
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('missing-target');
    });

    it('does not flag $(MAKE) call to defined target', async () => {
        writeMakefile('test:\n\techo test\nbuild:\n\t$(MAKE) test\n');
        expect(await caMakefile001.run(makeCtx())).toHaveLength(0);
    });

    it('skips files with -include (external targets may exist)', async () => {
        writeMakefile('-include common.mk\nbuild:\n\t$(MAKE) external-target\n');
        expect(await caMakefile001.run(makeCtx())).toHaveLength(0);
    });
});
