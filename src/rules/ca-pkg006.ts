import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Rule, RuleContext } from '../types.js';
import { stripJsoncComments } from '../util/jsonc.js';

export const caPkg006: Rule = {
    id: 'CA-PKG006',
    description:
        'package.json "types" or "typings" field references a .d.ts path that does not exist — consumers will get a "cannot find type declarations" error.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];
        const pkgPath = path.join(ctx.repoRoot, 'package.json');
        if (!fs.existsSync(pkgPath)) return [];

        let pkg: Record<string, unknown>;
        try {
            pkg = JSON.parse(stripJsoncComments(fs.readFileSync(pkgPath, 'utf-8'))) as Record<string, unknown>;
        } catch {
            return [];
        }

        for (const field of ['types', 'typings'] as const) {
            const value = pkg[field];
            if (typeof value !== 'string' || value.length === 0) continue;
            const resolved = path.resolve(path.dirname(pkgPath), value);
            if (!fs.existsSync(resolved)) {
                findings.push({
                    ruleId: 'CA-PKG006',
                    severity: 'error',
                    file: 'package.json',
                    message: `package.json "${field}" points to "${value}" which does not exist. Build the package first or correct the path.`,
                    fix: `Run your build step to generate the declaration files, or update "${field}" to the correct path.`,
                });
            }
        }

        return findings;
    },
};
