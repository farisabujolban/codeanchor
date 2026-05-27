import fs from 'node:fs';
import path from 'node:path';
import { getHotFiles } from '../git/history.js';
import { isExcluded } from '../util/exclude.js';
function loadCodeownersPatterns(repoRoot) {
    const candidates = [
        path.join(repoRoot, '.github', 'CODEOWNERS'),
        path.join(repoRoot, 'CODEOWNERS'),
        path.join(repoRoot, 'docs', 'CODEOWNERS'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return fs.readFileSync(p, 'utf-8')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(line => line.split(/\s+/)[0]); // first token is the pattern
        }
    }
    return null;
}
// Convert a CODEOWNERS glob pattern into a RegExp that matches file paths
function patternToRegex(pattern) {
    const anchored = pattern.startsWith('/');
    let p = anchored ? pattern.slice(1) : pattern;
    // Escape regex metacharacters except * and ?
    p = p
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\x00') // placeholder for **
        .replace(/\*/g, '[^/]*') // * → any non-slash chars
        .replace(/\?/g, '[^/]') // ? → any single non-slash char
        .replace(/\x00/g, '.*'); // ** → anything
    // If anchored, match from root; otherwise can appear anywhere in path
    const src = anchored ? `^${p}(/.*)?$` : `(^|/)${p}(/.*)?$`;
    return new RegExp(src);
}
function isCovered(filePath, patterns) {
    // Normalise to forward slashes
    const normalised = filePath.replace(/\\/g, '/');
    return patterns.some(pat => patternToRegex(pat).test(normalised));
}
export const caOwn001 = {
    id: 'CA-OWN001',
    description: 'Hot file has no matching entry in CODEOWNERS.',
    defaultSeverity: 'warn',
    applicableModes: ['history'],
    async run(ctx) {
        const patterns = loadCodeownersPatterns(ctx.repoRoot);
        if (!patterns)
            return []; // no CODEOWNERS file — skip
        const since = ctx.since ?? '90d';
        const hotFiles = getHotFiles(ctx.repoRoot, since, 3);
        if (hotFiles.length === 0)
            return [];
        const findings = [];
        for (const { path: filePath, commitCount } of hotFiles) {
            if (isExcluded(filePath, ctx.config.exclude))
                continue;
            if (!isCovered(filePath, patterns)) {
                findings.push({
                    ruleId: 'CA-OWN001',
                    severity: 'warn',
                    file: filePath,
                    message: `Hot file changed ${commitCount} times has no CODEOWNERS entry.`,
                    fix: `Add an entry for ${filePath} to CODEOWNERS.`,
                });
            }
        }
        return findings;
    },
};
