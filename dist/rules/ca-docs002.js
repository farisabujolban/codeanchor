import fs from 'node:fs';
import path from 'node:path';
import { isExcluded } from '../util/exclude.js';
function walkMd(dir, results) {
    if (!fs.existsSync(dir))
        return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            walkMd(full, results);
        else if (entry.name.endsWith('.md'))
            results.push(full);
    }
}
function findDocFiles(root) {
    const files = [];
    const readme = path.join(root, 'README.md');
    if (fs.existsSync(readme))
        files.push(readme);
    walkMd(path.join(root, 'docs'), files);
    return files;
}
function extractLocalLinks(content) {
    const refs = [];
    // Match [text](./path) and [text](../path) — relative only, skip https://
    const pattern = /\[[^\]]*\]\((\.{1,2}\/[^)]*)\)/g;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(lines[i])) !== null) {
            let target = m[1];
            // Strip #anchor fragment before checking existence
            const hashIdx = target.indexOf('#');
            if (hashIdx !== -1)
                target = target.slice(0, hashIdx);
            if (target)
                refs.push({ target, line: i + 1 });
        }
    }
    return refs;
}
export const caDocs002 = {
    id: 'CA-DOCS002',
    description: 'README or docs contain a broken relative Markdown link.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],
    async run(ctx) {
        const findings = [];
        for (const docFile of findDocFiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, docFile);
            if (isExcluded(relPath, ctx.config.exclude))
                continue;
            const content = fs.readFileSync(docFile, 'utf-8');
            const docDir = path.dirname(docFile);
            for (const { target, line } of extractLocalLinks(content)) {
                const resolved = path.resolve(docDir, target);
                if (!fs.existsSync(resolved)) {
                    findings.push({
                        ruleId: 'CA-DOCS002',
                        severity: 'error',
                        file: relPath,
                        line,
                        message: `Broken local link: "${target}" does not exist.`,
                    });
                }
            }
        }
        return findings;
    },
};
