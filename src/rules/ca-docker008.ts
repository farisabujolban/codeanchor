import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

function findDockerfiles(root: string): string[] {
    const files: string[] = [];
    try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isFile() && (entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.'))) {
                files.push(path.join(root, entry.name));
            }
        }
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const sub = path.join(root, entry.name);
            try {
                for (const s of fs.readdirSync(sub, { withFileTypes: true })) {
                    if (s.isFile() && (s.name === 'Dockerfile' || s.name.startsWith('Dockerfile.'))) {
                        files.push(path.join(sub, s.name));
                    }
                }
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* ignore */
    }
    return files;
}

export const caDocker008: Rule = {
    id: 'CA-DOCKER008',
    description:
        'Dockerfile declares a multi-stage build with named intermediate stages that are never referenced in a COPY --from= instruction. The build stage runs but its output is silently discarded.',
    defaultSeverity: 'warn',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        for (const dockerFile of findDockerfiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, dockerFile);
            if (isExcluded(relPath, ctx.config.exclude)) continue;

            const lines = fs.readFileSync(dockerFile, 'utf-8').split('\n');

            // Collect all FROM instructions (named stages)
            const fromInstructions: Array<{ name: string | null; line: number }> = [];
            const referencedStages = new Set<string>();

            for (let i = 0; i < lines.length; i++) {
                const fromMatch = lines[i].match(/^\s*FROM\s+\S+(?:\s+AS\s+(\S+))?\s*(?:#.*)?$/i);
                if (fromMatch) {
                    fromInstructions.push({
                        name: fromMatch[1] ? fromMatch[1].toLowerCase() : null,
                        line: i + 1,
                    });
                }
                // Collect --from= references (COPY --from=X or RUN --mount=...,from=X)
                const fromRefs = lines[i].matchAll(/--from=([^\s,]+)/gi);
                for (const ref of fromRefs) {
                    referencedStages.add(ref[1].toLowerCase());
                }
            }

            // Only relevant if there are multiple FROM instructions
            if (fromInstructions.length <= 1) continue;

            // All stages except the final one are candidates; named only
            const nonFinalStages = fromInstructions.slice(0, -1);
            for (const stage of nonFinalStages) {
                if (!stage.name) continue; // unnamed intermediate stage — skip
                if (referencedStages.has(stage.name)) continue;

                findings.push({
                    ruleId: 'CA-DOCKER008',
                    severity: 'warn',
                    file: relPath,
                    line: stage.line,
                    message: `Build stage "${stage.name}" is defined but never referenced in any COPY --from="${stage.name}" instruction. Its output is silently discarded.`,
                    fix: `Add COPY --from=${stage.name} <src> <dest> in a later stage, or remove the unused stage.`,
                });
            }
        }

        return findings;
    },
};
