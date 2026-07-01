import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caOpenapi002 } from '../../src/rules/ca-openapi002.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-openapi002-'));
}

function writeFile(dir: string, name: string, content: string): void {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-OPENAPI002', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when no OpenAPI spec exists', async () => {
        const findings = await caOpenapi002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when spec has no $ref', async () => {
        writeFile(
            tmpDir,
            'openapi.yaml',
            `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: OK
`,
        );
        const findings = await caOpenapi002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when $ref points to a defined component', async () => {
        writeFile(
            tmpDir,
            'openapi.yaml',
            `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
`,
        );
        const findings = await caOpenapi002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags a $ref to a schema that is not defined', async () => {
        writeFile(
            tmpDir,
            'openapi.yaml',
            `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Missing'
`,
        );
        const findings = await caOpenapi002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-OPENAPI002');
        expect(findings[0].message).toMatch(/#\/components\/schemas\/Missing/);
    });

    it('flags a $ref to a response that is not defined', async () => {
        writeFile(
            tmpDir,
            'openapi.yaml',
            `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      responses:
        "404":
          $ref: '#/components/responses/NotFound'
`,
        );
        const findings = await caOpenapi002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toMatch(/NotFound/);
    });

    it('deduplicates: same dead $ref reported only once', async () => {
        writeFile(
            tmpDir,
            'openapi.yaml',
            `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /a:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Missing'
  /b:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Missing'
`,
        );
        const findings = await caOpenapi002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('flags an external $ref pointing to a file that does not exist', async () => {
        writeFile(
            tmpDir,
            'openapi.yaml',
            `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: './schemas/missing.yaml'
`,
        );
        const findings = await caOpenapi002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toMatch(/missing\.yaml/);
    });

    it('reports nothing for an external $ref pointing to an existing file', async () => {
        writeFile(tmpDir, 'schemas/user.yaml', `type: object`);
        writeFile(
            tmpDir,
            'openapi.yaml',
            `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: './schemas/user.yaml'
`,
        );
        const findings = await caOpenapi002.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });
});
