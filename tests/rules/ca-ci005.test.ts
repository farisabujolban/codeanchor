import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caCi005 } from '../../src/rules/ca-ci005.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-ci005-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string): void {
    const full = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}
function makeCtx(): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-CI005', () => {
    it('returns no findings when no workflow files exist', async () => {
        expect(await caCi005.run(makeCtx())).toHaveLength(0);
    });

    it('flags a job that needs an undefined job', async () => {
        writeFile(
            '.github/workflows/ci.yml',
            `
jobs:
  build:
    needs: nonexistent
    steps: []
`,
        );
        const findings = await caCi005.run(makeCtx());
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-CI005');
        expect(findings[0].message).toContain('"nonexistent"');
    });

    it('does not flag a job that needs a defined job', async () => {
        writeFile(
            '.github/workflows/ci.yml',
            `
jobs:
  build:
    steps: []
  deploy:
    needs: build
    steps: []
`,
        );
        expect(await caCi005.run(makeCtx())).toHaveLength(0);
    });

    it('flags multiple undefined dependencies', async () => {
        writeFile(
            '.github/workflows/ci.yml',
            `
jobs:
  deploy:
    needs: [missing1, missing2]
    steps: []
`,
        );
        const findings = await caCi005.run(makeCtx());
        expect(findings).toHaveLength(2);
    });
});
