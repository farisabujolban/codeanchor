import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

// Matches: "  permissions: write-all" (with optional trailing comment)
const WRITE_ALL_RE = /^\s*permissions:\s*write-all\s*(#.*)?$/;

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

export const caCi006: Rule = {
    id: 'CA-CI006',
    description:
        'GitHub Actions workflow grants "permissions: write-all", giving every action in the job full write access to the repository. Violates least-privilege.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        for (const workflowFile of findWorkflowFiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, workflowFile);
            if (isExcluded(relPath, ctx.config.exclude)) continue;

            const lines = fs.readFileSync(workflowFile, 'utf-8').split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (!WRITE_ALL_RE.test(lines[i])) continue;
                findings.push({
                    ruleId: 'CA-CI006',
                    severity: 'error',
                    file: relPath,
                    line: i + 1,
                    message: `Workflow uses "permissions: write-all", granting all actions full repo write access. Specify only the permissions each job actually needs.`,
                    fix: `Replace "permissions: write-all" with scoped permissions, e.g.:\npermissions:\n  contents: read`,
                });
            }
        }

        return findings;
    },
};
