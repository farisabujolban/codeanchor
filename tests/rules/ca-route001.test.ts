import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caRoute001 } from '../../src/rules/ca-route001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-route001-'));
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

describe('CA-ROUTE001', () => {
    it('returns no findings when no source files', async () => {
        expect(await caRoute001.run(makeCtx())).toHaveLength(0);
    });

    it('flags req.params key that does not match route param', async () => {
        writeFile(
            'src/routes.ts',
            `
import express from 'express'
const router = express.Router()
router.get('/users/:id', async (req, res) => {
  const userId = req.params.userId
})
`,
        );
        const findings = await caRoute001.run(makeCtx());
        expect(findings.some((f) => f.ruleId === 'CA-ROUTE001')).toBe(true);
    });

    it('does not flag when req.params key matches route param', async () => {
        writeFile(
            'src/routes.ts',
            `
import express from 'express'
const router = express.Router()
router.get('/users/:id', async (req, res) => {
  const id = req.params.id
})
`,
        );
        expect(await caRoute001.run(makeCtx())).toHaveLength(0);
    });
});
