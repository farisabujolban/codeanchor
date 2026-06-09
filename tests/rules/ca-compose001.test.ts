import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caCompose001 } from '../../src/rules/ca-compose001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-compose001-'));
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

describe('CA-COMPOSE001', () => {
    it('returns no findings when no compose file exists', async () => {
        expect(await caCompose001.run(makeCtx())).toHaveLength(0);
    });

    it('flags undefined depends_on service', async () => {
        writeFile(
            'docker-compose.yml',
            `
services:
  app:
    depends_on: [missing_db]
`,
        );
        const findings = await caCompose001.run(makeCtx());
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('"missing_db"');
    });

    it('does not flag a valid depends_on', async () => {
        writeFile(
            'docker-compose.yml',
            `
services:
  db:
    image: postgres
  app:
    depends_on: [db]
`,
        );
        expect(await caCompose001.run(makeCtx())).toHaveLength(0);
    });

    it('flags named volume not declared at top level', async () => {
        writeFile(
            'docker-compose.yml',
            `
services:
  app:
    volumes:
      - mydata:/data
`,
        );
        const findings = await caCompose001.run(makeCtx());
        expect(findings.some((f) => f.message.includes('mydata'))).toBe(true);
    });

    it('does not flag declared named volume', async () => {
        writeFile(
            'docker-compose.yml',
            `
services:
  app:
    volumes:
      - mydata:/data
volumes:
  mydata:
`,
        );
        expect(await caCompose001.run(makeCtx())).toHaveLength(0);
    });
});
