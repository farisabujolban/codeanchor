import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caDocker005 } from '../../src/rules/ca-docker005.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docker005-'));
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

describe('CA-DOCKER005', () => {
    it('returns no findings when no Dockerfile exists', async () => {
        expect(await caDocker005.run(makeCtx())).toHaveLength(0);
    });

    it('flags missing .dockerignore', async () => {
        writeFile('Dockerfile', 'FROM node:20\n');
        const findings = await caDocker005.run(makeCtx());
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('.dockerignore');
    });

    it('flags missing node_modules exclusion in .dockerignore', async () => {
        writeFile('Dockerfile', 'FROM node:20\n');
        writeFile('.dockerignore', '.env\n.git\n*.pem\n');
        const findings = await caDocker005.run(makeCtx());
        expect(findings.some((f) => f.message.includes('node_modules'))).toBe(true);
    });

    it('returns no findings for comprehensive .dockerignore', async () => {
        writeFile('Dockerfile', 'FROM node:20\n');
        writeFile('.dockerignore', 'node_modules\n.env*\n.git\n*.pem\n');
        expect(await caDocker005.run(makeCtx())).toHaveLength(0);
    });
});
