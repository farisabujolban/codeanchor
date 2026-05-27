import fs from 'node:fs';
import path from 'node:path';
import { getHotFiles, getFileCommitCount } from '../git/history.js';
import { isExcluded } from '../util/exclude.js';
const STALENESS_RATIO = 5;
function findTestFile(repoRoot, sourceFile) {
    const dir = path.dirname(sourceFile);
    const base = path.basename(sourceFile);
    const ext = path.extname(base);
    const stem = base.slice(0, -ext.length);
    const candidates = [];
    if (ext === '.py') {
        candidates.push(path.join(dir, `test_${stem}.py`), path.join(dir, `${stem}_test.py`), path.join(dir, 'tests', `test_${stem}.py`), path.join('tests', `test_${stem}.py`));
    }
    else if (ext === '.java') {
        candidates.push(path.join(dir, `${stem}Test.java`), path.join(dir, `${stem}Spec.java`));
    }
    else {
        candidates.push(path.join(dir, `${stem}.test${ext}`), path.join(dir, `${stem}.spec${ext}`), path.join(dir, '__tests__', `${stem}${ext}`), path.join(dir, `${stem}.test.ts`), path.join(dir, `${stem}.test.js`), path.join(dir, `${stem}.spec.ts`), path.join(dir, `${stem}.spec.js`));
    }
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(repoRoot, candidate)))
            return candidate;
    }
    return null;
}
export const rdTest002 = {
    id: 'RD-TEST002',
    description: 'Hot file changed much more frequently than its test — test may be stale.',
    defaultSeverity: 'warn',
    applicableModes: ['history'],
    async run(ctx) {
        const since = ctx.since ?? '90d';
        const hotFiles = getHotFiles(ctx.repoRoot, since, 3);
        if (hotFiles.length === 0)
            return [];
        const findings = [];
        for (const { path: filePath, commitCount } of hotFiles) {
            if (isExcluded(filePath, ctx.config.exclude))
                continue;
            if (!fs.existsSync(path.join(ctx.repoRoot, filePath)))
                continue;
            const testFile = findTestFile(ctx.repoRoot, filePath);
            if (!testFile)
                continue; // RD-TEST001 handles missing tests
            const testCommits = getFileCommitCount(ctx.repoRoot, testFile, since);
            if (testCommits === 0 || commitCount >= STALENESS_RATIO * testCommits) {
                findings.push({
                    ruleId: 'RD-TEST002',
                    severity: 'warn',
                    file: filePath,
                    message: `Source changed ${commitCount}x but test (${testFile}) changed only ${testCommits}x in the last ${since}.`,
                    detail: `Ratio ${commitCount}:${testCommits} exceeds the ${STALENESS_RATIO}:1 threshold — test coverage may be stale.`,
                    fix: `Review and update ${testFile} to match recent changes.`,
                });
            }
        }
        return findings;
    },
};
