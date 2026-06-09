import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caCompose002 } from '../../src/rules/ca-compose002.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-compose002-'));
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

describe('CA-COMPOSE002', () => {
    it('returns no findings when no compose file', async () => {
        expect(await caCompose002.run(makeCtx())).toHaveLength(0);
    });

    it('flags missing env_file', async () => {
        writeFile(
            'docker-compose.yml',
            `
services:
  app:
    env_file: .env.local
`,
        );
        const findings = await caCompose002.run(makeCtx());
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('.env.local');
    });

    it('does not flag existing env_file', async () => {
        writeFile('.env.local', 'KEY=val');
        writeFile(
            'docker-compose.yml',
            `
services:
  app:
    env_file: .env.local
`,
        );
        expect(await caCompose002.run(makeCtx())).toHaveLength(0);
    });

    it('flags missing build.dockerfile', async () => {
        writeFile(
            'docker-compose.yml',
            `
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.missing
`,
        );
        const findings = await caCompose002.run(makeCtx());
        expect(findings.some((f) => f.message.includes('Dockerfile.missing'))).toBe(true);
    });
});
