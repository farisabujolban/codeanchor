import fs from 'node:fs';
import path from 'node:path';
import { isExcluded } from '../util/exclude.js';
function findDockerfiles(root) {
    const files = [];
    try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isFile() &&
                (entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.'))) {
                files.push(path.join(root, entry.name));
            }
        }
    }
    catch { /* ignore unreadable root */ }
    return files;
}
export const caDocker001 = {
    id: 'CA-DOCKER001',
    description: 'Dockerfile COPY or ADD references a source path that does not exist.',
    defaultSeverity: 'warn',
    applicableModes: ['repo', 'pr'],
    async run(ctx) {
        const findings = [];
        for (const dockerFile of findDockerfiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, dockerFile);
            if (isExcluded(relPath, ctx.config.exclude))
                continue;
            const content = fs.readFileSync(dockerFile, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                // Skip multi-stage COPY --from=
                if (/^COPY\s+--from=/i.test(trimmed))
                    continue;
                let src = null;
                if (/^COPY\s+/i.test(trimmed)) {
                    // Strip inline flags like --chown= before splitting
                    const withoutFlags = trimmed.replace(/--\w[\w-]*=\S+\s*/g, '');
                    const parts = withoutFlags.split(/\s+/).slice(1);
                    if (parts.length >= 2)
                        src = parts[0];
                }
                else if (/^ADD\s+/i.test(trimmed)) {
                    const parts = trimmed.split(/\s+/).slice(1);
                    if (parts.length >= 2) {
                        const candidate = parts[0];
                        // Skip URLs
                        if (/^https?:\/\//i.test(candidate))
                            continue;
                        src = candidate;
                    }
                }
                if (src) {
                    const resolved = path.join(ctx.repoRoot, src);
                    if (!fs.existsSync(resolved)) {
                        findings.push({
                            ruleId: 'CA-DOCKER001',
                            severity: 'warn',
                            file: relPath,
                            line: i + 1,
                            message: `COPY source path "${src}" does not exist.`,
                        });
                    }
                }
            }
        }
        return findings;
    },
};
