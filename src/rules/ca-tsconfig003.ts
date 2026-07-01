import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Rule, RuleContext } from '../types.js';
import { stripJsoncComments } from '../util/jsonc.js';

const BUNDLER_CONFIGS = [
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mts',
    'vite.config.mjs',
    'webpack.config.js',
    'webpack.config.ts',
    'webpack.config.mjs',
    'rspack.config.js',
    'rspack.config.ts',
    'esbuild.config.js',
    'esbuild.config.ts',
];

interface TsConfig {
    compilerOptions?: {
        paths?: Record<string, string[]>;
    };
}

function findTsconfigs(root: string): string[] {
    try {
        return fs
            .readdirSync(root, { withFileTypes: true })
            .filter((e) => e.isFile() && (e.name === 'tsconfig.json' || /^tsconfig\..+\.json$/.test(e.name)))
            .map((e) => path.join(root, e.name));
    } catch {
        return [];
    }
}

function extractAliasKeysFromBundler(content: string): Set<string> {
    const keys = new Set<string>();
    // Extract keys from alias objects: '@foo': ... or "@foo": ...
    const aliasBlockMatch = content.match(/alias\s*:\s*\{([^}]+)\}/s);
    if (!aliasBlockMatch) return keys;
    const block = aliasBlockMatch[1];
    const keyRe = /['"](@[\w/]+)['"]\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = keyRe.exec(block)) !== null) {
        keys.add(m[1]);
    }
    return keys;
}

export const caTsconfig003: Rule = {
    id: 'CA-TSCONFIG003',
    description:
        'TypeScript "paths" alias defined in tsconfig.json is not mirrored in the bundler config (Vite/webpack). The IDE resolves imports via tsconfig, but the bundler fails at runtime.',
    defaultSeverity: 'warn',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        const tsconfigFiles = findTsconfigs(ctx.repoRoot);
        if (tsconfigFiles.length === 0) return [];

        // Find bundler configs
        const bundlerFiles = BUNDLER_CONFIGS.filter((f) => fs.existsSync(path.join(ctx.repoRoot, f)));
        if (bundlerFiles.length === 0) return []; // pure tsc project — paths are the mechanism

        // Collect all alias keys from all bundler configs
        const bundlerAliases = new Set<string>();
        for (const bundlerFile of bundlerFiles) {
            try {
                const content = fs.readFileSync(path.join(ctx.repoRoot, bundlerFile), 'utf-8');
                for (const key of extractAliasKeysFromBundler(content)) {
                    bundlerAliases.add(key);
                }
            } catch {
                /* ignore */
            }
        }

        for (const tsconfigFile of tsconfigFiles) {
            let cfg: TsConfig;
            try {
                cfg = JSON.parse(stripJsoncComments(fs.readFileSync(tsconfigFile, 'utf-8'))) as TsConfig;
            } catch {
                continue;
            }

            const paths = cfg.compilerOptions?.paths;
            if (!paths || Object.keys(paths).length === 0) continue;

            const relTsconfig = path.relative(ctx.repoRoot, tsconfigFile);

            for (const alias of Object.keys(paths)) {
                // Normalize: strip trailing /* for comparison
                const baseAlias = alias.replace(/\/\*$/, '');
                if (bundlerAliases.has(baseAlias)) continue;

                findings.push({
                    ruleId: 'CA-TSCONFIG003',
                    severity: 'warn',
                    file: relTsconfig,
                    message: `Path alias "${alias}" is defined in ${relTsconfig} but not found in any bundler config (${bundlerFiles.join(', ')}). Add a matching alias to your bundler config.`,
                    fix: `Add to vite.config: resolve: { alias: { '${baseAlias}': path.resolve(__dirname, '${paths[alias][0]?.replace('/*', '') ?? 'src'}') } }`,
                });
            }
        }

        return findings;
    },
};
