import fs from 'node:fs';
import path from 'node:path';
import { isExcluded } from '../util/exclude.js';
// Collect all local path strings referenced in an `exports` field (recursive)
function collectExportsPaths(value, results) {
    if (typeof value === 'string') {
        results.push(value);
    }
    else if (Array.isArray(value)) {
        for (const item of value)
            collectExportsPaths(item, results);
    }
    else if (value !== null && typeof value === 'object') {
        for (const v of Object.values(value))
            collectExportsPaths(v, results);
    }
}
// Returns true if the string looks like a local path (starts with ./ or ../)
function isLocalPath(s) {
    return s.startsWith('./') || s.startsWith('../');
}
function collectEntrypointPaths(pkg) {
    const entries = [];
    for (const field of ['main', 'module', 'types', 'typings']) {
        const v = pkg[field];
        if (typeof v === 'string' && isLocalPath(v)) {
            entries.push({ field, localPath: v });
        }
    }
    if (pkg.bin) {
        if (typeof pkg.bin === 'string') {
            if (isLocalPath(pkg.bin))
                entries.push({ field: 'bin', localPath: pkg.bin });
        }
        else {
            for (const [name, p] of Object.entries(pkg.bin)) {
                if (isLocalPath(p))
                    entries.push({ field: `bin.${name}`, localPath: p });
            }
        }
    }
    if (pkg.exports !== undefined) {
        const paths = [];
        collectExportsPaths(pkg.exports, paths);
        for (const p of paths) {
            if (isLocalPath(p))
                entries.push({ field: 'exports', localPath: p });
        }
    }
    if (Array.isArray(pkg.files)) {
        for (const entry of pkg.files) {
            if (typeof entry === 'string' && isLocalPath(entry)) {
                entries.push({ field: 'files', localPath: entry });
            }
        }
    }
    return entries;
}
export const caPkg002 = {
    id: 'CA-PKG002',
    description: 'package.json entrypoint field references a local path that does not exist.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],
    async run(ctx) {
        const pkgPath = path.join(ctx.repoRoot, 'package.json');
        if (!fs.existsSync(pkgPath))
            return [];
        if (isExcluded('package.json', ctx.config.exclude))
            return [];
        let pkg;
        try {
            pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        }
        catch {
            return [];
        }
        const findings = [];
        for (const { field, localPath } of collectEntrypointPaths(pkg)) {
            // Strip trailing /* glob (e.g. "./dist/*")
            const stripped = localPath.replace(/\/\*$/, '');
            const resolved = path.resolve(ctx.repoRoot, stripped);
            if (!fs.existsSync(resolved)) {
                findings.push({
                    ruleId: 'CA-PKG002',
                    severity: 'error',
                    file: 'package.json',
                    message: `package.json "${field}" references "${localPath}" which does not exist.`,
                });
            }
        }
        return findings;
    },
};
