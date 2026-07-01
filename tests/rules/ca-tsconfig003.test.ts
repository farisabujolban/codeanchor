import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caTsconfig003 } from '../../src/rules/ca-tsconfig003.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-tsconfig003-'));
}

function writeFile(dir: string, name: string, content: string): void {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-TSCONFIG003', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when no tsconfig exists', async () => {
        const findings = await caTsconfig003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when tsconfig has no paths', async () => {
        writeFile(tmpDir, 'tsconfig.json', JSON.stringify({ compilerOptions: { strict: true } }));
        writeFile(tmpDir, 'vite.config.ts', `export default {}`);
        const findings = await caTsconfig003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when paths exist but no bundler config is found (pure tsc project)', async () => {
        writeFile(
            tmpDir,
            'tsconfig.json',
            JSON.stringify({
                compilerOptions: { paths: { '@components/*': ['src/components/*'] } },
            }),
        );
        const findings = await caTsconfig003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when tsconfig paths are mirrored in vite.config', async () => {
        writeFile(
            tmpDir,
            'tsconfig.json',
            JSON.stringify({
                compilerOptions: { paths: { '@components/*': ['src/components/*'] } },
            }),
        );
        writeFile(
            tmpDir,
            'vite.config.ts',
            `
import path from 'path';
export default {
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src/components'),
    },
  },
};
`,
        );
        const findings = await caTsconfig003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags when tsconfig has a path alias missing from vite.config', async () => {
        writeFile(
            tmpDir,
            'tsconfig.json',
            JSON.stringify({
                compilerOptions: {
                    paths: {
                        '@components/*': ['src/components/*'],
                        '@utils/*': ['src/utils/*'],
                    },
                },
            }),
        );
        writeFile(
            tmpDir,
            'vite.config.ts',
            `
export default {
  resolve: {
    alias: {
      '@components': './src/components',
    },
  },
};
`,
        );
        const findings = await caTsconfig003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-TSCONFIG003');
        expect(findings[0].message).toMatch(/@utils/);
    });

    it('flags all missing aliases when none match vite.config', async () => {
        writeFile(
            tmpDir,
            'tsconfig.json',
            JSON.stringify({
                compilerOptions: {
                    paths: {
                        '@api/*': ['src/api/*'],
                        '@ui/*': ['src/ui/*'],
                    },
                },
            }),
        );
        writeFile(tmpDir, 'vite.config.ts', `export default { resolve: { alias: {} } }`);
        const findings = await caTsconfig003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('also checks webpack.config.js', async () => {
        writeFile(
            tmpDir,
            'tsconfig.json',
            JSON.stringify({
                compilerOptions: { paths: { '@src/*': ['src/*'] } },
            }),
        );
        writeFile(
            tmpDir,
            'webpack.config.js',
            `
module.exports = {
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, 'src'),
    },
  },
};
`,
        );
        const findings = await caTsconfig003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });
});
