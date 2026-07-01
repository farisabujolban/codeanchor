import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

// Full 40-character commit SHA
const FULL_SHA_RE = /^\s*-?\s*uses:\s*([^./\s][^@\s]*)@([0-9a-f]{40})(.*)/i;

function findWorkflowFiles(repoRoot: string): string[] {
    const dir = path.join(repoRoot, '.github', 'workflows');
    if (!fs.existsSync(dir)) return [];
    try {
        return fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
            .map((f) => path.join(dir, f));
    } catch {
        return [];
    }
}

export const caCi007: Rule = {
    id: 'CA-CI007',
    description:
        'GitHub Actions action is pinned to a full commit SHA (good) but has no inline comment identifying the version (e.g. # v2.3.1). Pins are unreadable without the annotation.',
    defaultSeverity: 'warn',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        for (const workflowFile of findWorkflowFiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, workflowFile);
            if (isExcluded(relPath, ctx.config.exclude)) continue;

            const lines = fs.readFileSync(workflowFile, 'utf-8').split('\n');
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(FULL_SHA_RE);
                if (!m) continue;
                const [, action, sha, rest] = m;
                if (rest.includes('#')) continue; // comment present

                findings.push({
                    ruleId: 'CA-CI007',
                    severity: 'warn',
                    file: relPath,
                    line: i + 1,
                    message: `Action "${action}@${sha.slice(0, 7)}…" is pinned to a SHA but has no version comment. Add a comment so reviewers know what version this is.`,
                    fix: `uses: ${action}@${sha}  # vX.Y.Z`,
                });
            }
        }

        return findings;
    },
};
