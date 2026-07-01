import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caDocker008 } from '../../src/rules/ca-docker008.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-docker008-'));
}

function writeFile(dir: string, name: string, content: string): void {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-DOCKER008', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when no Dockerfile exists', async () => {
        const findings = await caDocker008.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for a single-stage Dockerfile', async () => {
        writeFile(
            tmpDir,
            'Dockerfile',
            `
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]
`,
        );
        const findings = await caDocker008.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing for a valid multi-stage build with COPY --from', async () => {
        writeFile(
            tmpDir,
            'Dockerfile',
            `
FROM node:18 AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/server.js"]
`,
        );
        const findings = await caDocker008.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags a multi-stage build where builder output is never consumed', async () => {
        writeFile(
            tmpDir,
            'Dockerfile',
            `
FROM node:18 AS builder
WORKDIR /app
RUN npm run build

FROM node:18-alpine
WORKDIR /app
CMD ["node", "server.js"]
`,
        );
        const findings = await caDocker008.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-DOCKER008');
        expect(findings[0].message).toMatch(/builder/);
    });

    it('reports nothing when the final stage is also named and consumes previous', async () => {
        writeFile(
            tmpDir,
            'Dockerfile',
            `
FROM node:18 AS builder
RUN npm run build

FROM node:18-alpine AS production
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/server.js"]
`,
        );
        const findings = await caDocker008.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags when one of three stages is never referenced', async () => {
        writeFile(
            tmpDir,
            'Dockerfile',
            `
FROM node:18 AS builder
RUN npm run build

FROM node:18 AS tester
RUN npm test

FROM node:18-alpine
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/server.js"]
`,
        );
        const findings = await caDocker008.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toMatch(/tester/);
    });

    it('reports nothing when case differs but names match (case-insensitive)', async () => {
        writeFile(
            tmpDir,
            'Dockerfile',
            `
FROM node:18 AS Builder
RUN npm run build

FROM node:18-alpine
COPY --from=builder /app/dist ./dist
CMD ["node", "server.js"]
`,
        );
        const findings = await caDocker008.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });
});
