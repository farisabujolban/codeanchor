import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caDocker003 } from '../../src/rules/ca-docker003.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docker003-'));
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

describe('CA-DOCKER003', () => {
    it('returns no findings when no runtime spec files exist', async () => {
        writeFile('Dockerfile', 'FROM node:20-alpine\nRUN npm ci\n');
        expect(await caDocker003.run(makeCtx())).toHaveLength(0);
    });

    it('flags Dockerfile node version mismatch with .nvmrc', async () => {
        writeFile('.nvmrc', '20');
        writeFile('Dockerfile', 'FROM node:18-alpine\nRUN npm ci\n');
        const findings = await caDocker003.run(makeCtx());
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('node:18');
    });

    it('returns no findings when versions match', async () => {
        writeFile('.nvmrc', '20');
        writeFile('Dockerfile', 'FROM node:20-alpine\nRUN npm ci\n');
        expect(await caDocker003.run(makeCtx())).toHaveLength(0);
    });

    it('returns no findings when node version matches', async () => {
        writeFile('.nvmrc', '18');
        writeFile('Dockerfile', 'FROM node:18-alpine\nRUN npm ci\n');
        expect(await caDocker003.run(makeCtx())).toHaveLength(0);
    });
});
