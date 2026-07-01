import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Rule, RuleContext } from '../types.js';

const MIGRATION_DIRS = [
    'migrations',
    'db/migrations',
    'database/migrations',
    'src/migrations',
    'src/db/migrations',
    'prisma/migrations',
    'supabase/migrations',
];

function extractTimestamp(filename: string): string | null {
    const m = filename.match(/^(\d+)/);
    return m ? m[1] : null;
}

export const caMigration003: Rule = {
    id: 'CA-MIGRATION003',
    description:
        'Two migration files share the same timestamp prefix — causes ordering ambiguity and merge conflicts in team environments.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        for (const migDir of MIGRATION_DIRS) {
            const absDir = path.join(ctx.repoRoot, migDir);
            if (!fs.existsSync(absDir)) continue;

            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(absDir, { withFileTypes: true });
            } catch {
                continue;
            }

            const byTimestamp = new Map<string, string[]>();
            for (const entry of entries) {
                if (!entry.isFile()) continue;
                const ts = extractTimestamp(entry.name);
                if (!ts) continue;
                const list = byTimestamp.get(ts) ?? [];
                list.push(entry.name);
                byTimestamp.set(ts, list);
            }

            for (const [ts, files] of byTimestamp) {
                if (files.length <= 1) continue;
                findings.push({
                    ruleId: 'CA-MIGRATION003',
                    severity: 'error',
                    file: migDir,
                    message: `Duplicate migration timestamp "${ts}" shared by: ${files.join(', ')}. Rename one file with a unique timestamp.`,
                    fix: `Assign a unique timestamp to each migration file (e.g. increment by 1 second).`,
                });
            }
        }

        return findings;
    },
};
