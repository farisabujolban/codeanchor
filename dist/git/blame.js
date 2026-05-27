import { execFileSync } from 'node:child_process';
export function getBlameLines(repoRoot, filePath) {
    let raw;
    try {
        raw = execFileSync('git', ['blame', '--porcelain', '--', filePath], {
            encoding: 'utf-8',
            cwd: repoRoot,
        });
    }
    catch {
        return [];
    }
    const lines = [];
    // commitTimes caches author-time per commit hash — porcelain omits it for repeated commits
    const commitTimes = new Map();
    const parts = raw.split('\n');
    let i = 0;
    while (i < parts.length) {
        const line = parts[i];
        if (!line) {
            i++;
            continue;
        }
        const headerMatch = line.match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/);
        if (!headerMatch) {
            i++;
            continue;
        }
        const hash = headerMatch[1];
        const finalLine = parseInt(headerMatch[2], 10);
        i++;
        let authorTime = commitTimes.get(hash) ?? 0;
        // Parse header fields until we hit the tab-prefixed content line
        while (i < parts.length && !parts[i].startsWith('\t')) {
            const field = parts[i];
            if (field.startsWith('author-time ')) {
                authorTime = parseInt(field.slice(12), 10);
                commitTimes.set(hash, authorTime);
            }
            i++;
        }
        const content = parts[i]?.startsWith('\t') ? parts[i].slice(1) : '';
        lines.push({ lineNumber: finalLine, commitHash: hash, authorTime, content });
        i++;
    }
    return lines;
}
// Returns a map from 1-indexed line number → age in seconds
export function getBlameAge(repoRoot, filePath) {
    const blameLines = getBlameLines(repoRoot, filePath);
    const now = Date.now() / 1000;
    const ageMap = new Map();
    for (const bl of blameLines) {
        ageMap.set(bl.lineNumber, now - bl.authorTime);
    }
    return ageMap;
}
