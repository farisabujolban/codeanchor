import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caOpenapi001 } from '../../src/rules/ca-openapi001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-oa001-'));
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

describe('CA-OPENAPI001', () => {
    it('returns no findings when no spec or source files', async () => {
        expect(await caOpenapi001.run(makeCtx())).toHaveLength(0);
    });

    it('flags a route in code not present in spec', async () => {
        writeFile(
            'openapi.yaml',
            `
openapi: "3.0.0"
paths:
  /users:
    get:
      summary: List users
`,
        );
        writeFile(
            'src/routes.ts',
            `
import express from 'express'
const app = express()
app.get('/users', handler)
app.post('/orders', handler)
`,
        );
        const findings = await caOpenapi001.run(makeCtx());
        expect(findings.some((f) => f.message.includes('/orders'))).toBe(true);
    });

    it('does not flag a route that is in the spec', async () => {
        writeFile(
            'openapi.yaml',
            `
openapi: "3.0.0"
paths:
  /users:
    get:
      summary: List users
`,
        );
        writeFile(
            'src/routes.ts',
            `
import express from 'express'
const app = express()
app.get('/users', handler)
`,
        );
        expect(await caOpenapi001.run(makeCtx())).toHaveLength(0);
    });
});
