import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

const SKIP_PREFIXES = ['workspace:', 'file:', 'link:', 'git+', 'github:', 'bitbucket:', 'gitlab:', 'npm:'];

function isUnpinned(version: string): boolean {
    const v = version.trim();
    if (!v) return true;
    if (SKIP_PREFIXES.some((p) => v.startsWith(p))) return false;
    // Exact semver: starts with a digit
    if (/^\d/.test(v)) return false;
    return true;
}

function stripSpecifier(version: string): string {
    return version.replace(/^[~^>=<* ]+/, '');
}

interface PackageJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

export const caPkg005: Rule = {
    id: 'CA-PKG005',
    description: 'package.json dependency uses a non-exact version specifier (^, ~, *, latest).',
    defaultSeverity: 'warn',
    applicableModes: ['repo', 'pr', 'staged'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const pkgPath = path.join(ctx.repoRoot, 'package.json');
        if (!fs.existsSync(pkgPath)) return [];
        if (isExcluded('package.json', ctx.config.exclude)) return [];

        if (ctx.mode === 'staged' && ctx.stagedDiffs) {
            if (!ctx.stagedDiffs.some((d) => d.path === 'package.json')) return [];
        }

        let pkg: PackageJson;
        let pkgContent: string;
        try {
            pkgContent = fs.readFileSync(pkgPath, 'utf-8');
            pkg = JSON.parse(pkgContent) as PackageJson;
        } catch {
            return [];
        }

        const findings: Finding[] = [];
        const pkgLines = pkgContent.split('\n');

        for (const field of ['dependencies', 'devDependencies'] as const) {
            const deps = pkg[field];
            if (!deps) continue;
            for (const [name, version] of Object.entries(deps)) {
                if (!isUnpinned(version)) continue;
                const lineIdx = pkgLines.findIndex((l) => l.includes(`"${name}"`) && l.includes(`"${version}"`));
                const exact = stripSpecifier(version);
                findings.push({
                    ruleId: 'CA-PKG005',
                    severity: 'warn',
                    file: 'package.json',
                    line: lineIdx >= 0 ? lineIdx + 1 : undefined,
                    message: `"${name}" in ${field} uses non-exact version "${version}". Non-pinned versions allow silent upgrades that can break builds.`,
                    fix: exact ? `Pin to "${exact}" for reproducible installs.` : 'Pin to an exact version.',
                });
            }
        }

        return findings;
    },
};
