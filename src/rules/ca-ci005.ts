import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

interface WorkflowJob {
    needs?: string | string[];
    [key: string]: unknown;
}

interface Workflow {
    jobs?: Record<string, WorkflowJob>;
    [key: string]: unknown;
}

function findWorkflowFiles(root: string): string[] {
    const dir = path.join(root, '.github', 'workflows');
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map((f) => path.join(dir, f));
}

function lineOf(rawLines: string[], text: string): number | undefined {
    for (let i = 0; i < rawLines.length; i++) {
        if (rawLines[i].includes(text)) return i + 1;
    }
    return undefined;
}

export const caCi005: Rule = {
    id: 'CA-CI005',
    description: 'GitHub Actions workflow "needs:" references a job that does not exist in the same workflow file.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        for (const wfFile of findWorkflowFiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, wfFile);
            if (isExcluded(relPath, ctx.config.exclude)) continue;

            let raw: string;
            try {
                raw = fs.readFileSync(wfFile, 'utf-8');
            } catch {
                continue;
            }

            let doc: Workflow;
            try {
                doc = yaml.load(raw) as Workflow;
            } catch {
                continue;
            }
            if (!doc?.jobs) continue;

            const definedJobs = new Set(Object.keys(doc.jobs));
            const rawLines = raw.split('\n');

            for (const [jobName, job] of Object.entries(doc.jobs)) {
                if (!job?.needs) continue;
                const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
                for (const dep of needs) {
                    if (!definedJobs.has(dep)) {
                        findings.push({
                            ruleId: 'CA-CI005',
                            severity: 'error',
                            file: relPath,
                            line: lineOf(rawLines, dep),
                            message: `Job "${jobName}" needs "${dep}" which is not defined in this workflow.`,
                            detail: `Defined jobs: ${[...definedJobs].join(', ')}`,
                        });
                    }
                }
            }
        }

        return findings;
    },
};
