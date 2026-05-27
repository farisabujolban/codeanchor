import fs from 'node:fs';
import path from 'node:path';
import { getHotFiles } from '../git/history.js';
import { isExcluded } from '../util/exclude.js';
// Returns the test file path if it exists, null otherwise
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
        // JS/TS/Go/C/C++/C#
        candidates.push(path.join(dir, `${stem}.test${ext}`), path.join(dir, `${stem}.spec${ext}`), path.join(dir, '__tests__', `${stem}${ext}`), 
        // also check without the original extension suffix, just base.test.ts etc
        path.join(dir, `${stem}.test.ts`), path.join(dir, `${stem}.test.js`), path.join(dir, `${stem}.spec.ts`), path.join(dir, `${stem}.spec.js`));
    }
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(repoRoot, candidate)))
            return candidate;
    }
    return null;
}
export const caTest001 = {
    id: 'CA-TEST001',
    description: 'Hot file (frequently changed) has no associated test file.',
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
            if (findTestFile(ctx.repoRoot, filePath) === null) {
                findings.push({
                    ruleId: 'CA-TEST001',
                    severity: 'warn',
                    file: filePath,
                    message: `Hot file changed ${commitCount} times in the last ${since} has no associated test.`,
                    fix: `Add a test file for ${path.basename(filePath)}.`,
                });
            }
        }
        return findings;
    },
};
