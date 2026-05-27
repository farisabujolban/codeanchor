import { execFileSync } from 'node:child_process';
export function getStagedDiff() {
    try {
        return execFileSync('git', ['diff', '--staged'], { encoding: 'utf-8' });
    }
    catch {
        return '';
    }
}
export function getPrDiff(base, head) {
    try {
        return execFileSync('git', ['diff', `${base}...${head}`], { encoding: 'utf-8' });
    }
    catch {
        return '';
    }
}
export function parseDiff(raw) {
    const results = [];
    const fileBlocks = raw.split(/^diff --git /m).slice(1);
    for (const block of fileBlocks) {
        const lines = block.split('\n');
        let path = '';
        let status = 'modified';
        const changedLines = new Set();
        for (const line of lines) {
            if (line.startsWith('--- /dev/null')) {
                status = 'added';
            }
            else if (line.startsWith('+++ /dev/null')) {
                status = 'deleted';
            }
            else if (line.startsWith('+++ b/')) {
                path = line.slice(6).trim();
            }
            else if (line.startsWith('rename to ')) {
                status = 'renamed';
                path = line.slice(10).trim();
            }
        }
        if (!path)
            continue;
        let newLineNum = 0;
        let inHunk = false;
        for (const line of lines) {
            const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (hunkMatch) {
                newLineNum = parseInt(hunkMatch[1], 10);
                inHunk = true;
                continue;
            }
            if (!inHunk)
                continue;
            if (line.startsWith('+') && !line.startsWith('+++')) {
                changedLines.add(newLineNum);
                newLineNum++;
            }
            else if (line.startsWith('-') && !line.startsWith('---')) {
                // removed line — doesn't advance new-file counter
            }
            else if (!line.startsWith('\\')) {
                newLineNum++;
            }
        }
        results.push({ path, status, changedLines });
    }
    return results;
}
export function diffTouchesRange(fileDiff, startLine, endLine) {
    for (let i = startLine; i <= endLine; i++) {
        if (fileDiff.changedLines.has(i))
            return true;
    }
    return false;
}
