import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Rule, RuleContext } from '../types.js';

const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'] as const;

export const caLock002: Rule = {
    id: 'CA-LOCK002',
    description:
        'Multiple package-manager lockfiles coexist (e.g. package-lock.json + yarn.lock). Causes non-deterministic installs across environments.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const present = LOCKFILES.filter((lf) => fs.existsSync(path.join(ctx.repoRoot, lf)));
        if (present.length <= 1) return [];
        return [
            {
                ruleId: 'CA-LOCK002',
                severity: 'error',
                file: present[0],
                message: `Multiple lockfiles detected: ${present.join(', ')}. Keep only one package manager's lockfile to ensure deterministic installs.`,
                fix: `Delete all lockfiles except the one for your chosen package manager, then regenerate it.`,
            },
        ];
    },
};
