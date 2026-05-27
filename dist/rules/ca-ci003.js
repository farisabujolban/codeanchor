import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { isExcluded } from '../util/exclude.js';
// Patterns for local file references inside `run:` blocks.
// Intentionally conservative to keep false positives low.
// Path form: optional ./ or ../ prefix, then one or more dir/segments, then file.ext
const LOCAL_PATH = /((?:\.{1,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.\w+)/;
const RUN_PATH_PATTERNS = [
    // node scripts/foo.js  |  node ./scripts/foo.js
    new RegExp(`\\bnode\\s+${LOCAL_PATH.source}`),
    // ts-node / tsx
    new RegExp(`\\b(?:ts-node|tsx)\\s+${LOCAL_PATH.source}`),
    // bash/sh scripts/foo.sh  |  bash ./scripts/foo.sh
    new RegExp(`\\b(?:bash|sh)\\s+${LOCAL_PATH.source}`),
    // python tools/foo.py
    new RegExp(`\\bpython3?\\s+${LOCAL_PATH.source}`),
    // ./scripts/foo.sh  (bare relative invocation)
    /(\.\/[\w./-]+\.\w+)/,
];
function findWorkflowFiles(root) {
    const dir = path.join(root, '.github', 'workflows');
    if (!fs.existsSync(dir))
        return [];
    return fs
        .readdirSync(dir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map(f => path.join(dir, f));
}
function extractRunPaths(runBlock) {
    const found = new Set();
    for (const line of runBlock.split('\n')) {
        for (const re of RUN_PATH_PATTERNS) {
            const m = line.match(re);
            if (m?.[1])
                found.add(m[1]);
        }
    }
    return [...found];
}
function findLineOf(rawLines, text) {
    for (let i = 0; i < rawLines.length; i++) {
        if (rawLines[i].includes(text))
            return i + 1;
    }
    return undefined;
}
export const caCi003 = {
    id: 'CA-CI003',
    description: 'GitHub Actions workflow references a local path that does not exist.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],
    async run(ctx) {
        const findings = [];
        for (const wfFile of findWorkflowFiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, wfFile);
            if (isExcluded(relPath, ctx.config.exclude))
                continue;
            const raw = fs.readFileSync(wfFile, 'utf-8');
            let doc;
            try {
                doc = yaml.load(raw);
            }
            catch {
                continue;
            }
            if (!doc?.jobs)
                continue;
            const rawLines = raw.split('\n');
            function report(localPath, hint) {
                const resolved = path.resolve(ctx.repoRoot, localPath);
                if (!fs.existsSync(resolved)) {
                    findings.push({
                        ruleId: 'CA-CI003',
                        severity: 'error',
                        file: relPath,
                        line: findLineOf(rawLines, localPath),
                        message: `${hint} "${localPath}" does not exist.`,
                    });
                }
            }
            for (const job of Object.values(doc.jobs)) {
                for (const step of job.steps ?? []) {
                    // working-directory
                    const wd = step['working-directory'];
                    if (typeof wd === 'string' && (wd.startsWith('./') || wd.startsWith('../') || (!wd.startsWith('/') && !wd.includes('$')))) {
                        report(wd, 'working-directory');
                    }
                    // with.path and with.cache-dependency-path
                    if (step.with && typeof step.with === 'object') {
                        for (const key of ['path', 'cache-dependency-path']) {
                            const val = step.with[key];
                            if (typeof val === 'string') {
                                // may be multi-line (newline-separated list)
                                for (const entry of val.split('\n').map(s => s.trim()).filter(Boolean)) {
                                    if (entry.startsWith('./') || entry.startsWith('../')) {
                                        report(entry, `with.${key}`);
                                    }
                                }
                            }
                        }
                    }
                    // run: block — extract conservatively matched local file references
                    if (step.run) {
                        for (const localPath of extractRunPaths(step.run)) {
                            report(localPath, 'run: script reference');
                        }
                    }
                }
            }
        }
        return findings;
    },
};
