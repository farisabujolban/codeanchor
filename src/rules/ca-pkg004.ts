import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

// Matches: npm run X, yarn run X, pnpm run X, yarn X, pnpm X (bare sub-command)
const SCRIPT_CALL_RE = /(npm run|pnpm run|yarn run|pnpm|yarn)\s+([a-zA-Z0-9:_-]+)/g;

// Built-in pnpm/yarn commands that are NOT script references
const YARN_PNPM_BUILTINS = new Set([
    'install',
    'add',
    'remove',
    'uninstall',
    'upgrade',
    'update',
    'link',
    'unlink',
    'import',
    'cache',
    'config',
    'init',
    'global',
    'publish',
    'pack',
    'workspaces',
    'workspace',
    'version',
    'info',
    'why',
    'list',
    'outdated',
    'audit',
    'create',
    'dlx',
    'exec',
    'store',
    'prune',
    'fetch',
    'env',
    'dedupe',
    'check',
    'rebuild',
    'approve',
    'ignore',
    'set',
]);

function extractCalledScripts(scriptValue: string): string[] {
    const names: string[] = [];
    SCRIPT_CALL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SCRIPT_CALL_RE.exec(scriptValue)) !== null) {
        const isRunForm = m[1].includes('run');
        const scriptName = m[2];
        if (!isRunForm && YARN_PNPM_BUILTINS.has(scriptName)) continue;
        names.push(scriptName);
    }
    return names;
}

export const caPkg004: Rule = {
    id: 'CA-PKG004',
    description: 'package.json script calls "npm run X" but X is not defined in scripts.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const pkgPath = path.join(ctx.repoRoot, 'package.json');
        if (!fs.existsSync(pkgPath)) return [];
        if (isExcluded('package.json', ctx.config.exclude)) return [];

        let pkg: { scripts?: Record<string, string> };
        let pkgContent: string;
        try {
            pkgContent = fs.readFileSync(pkgPath, 'utf-8');
            pkg = JSON.parse(pkgContent) as { scripts?: Record<string, string> };
        } catch {
            return [];
        }
        if (!pkg.scripts) return [];

        const scriptKeys = new Set(Object.keys(pkg.scripts));
        const pkgLines = pkgContent.split('\n');
        const findings: Finding[] = [];

        for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
            for (const called of extractCalledScripts(scriptValue)) {
                if (!scriptKeys.has(called)) {
                    const lineIdx = pkgLines.findIndex((l) => l.includes(`"${scriptName}"`) && l.includes(called));
                    findings.push({
                        ruleId: 'CA-PKG004',
                        severity: 'error',
                        file: 'package.json',
                        line: lineIdx >= 0 ? lineIdx + 1 : undefined,
                        message: `Script "${scriptName}" calls "npm run ${called}" but "${called}" is not defined in scripts.`,
                        detail: `Defined scripts: ${[...scriptKeys].join(', ')}`,
                    });
                }
            }
        }
        return findings;
    },
};
