import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';

const SAFE_SUFFIXES = ['.example', '.sample', '.template', '.test'];

function isDangerousEnvFile(base: string): boolean {
    if (!base.startsWith('.env')) return false;
    return !SAFE_SUFFIXES.some((s) => base.endsWith(s));
}

function readGitignorePatterns(root: string): string[] {
    const patterns: string[] = [];
    // Read .gitignore at repo root and any parent up to filesystem root
    let dir = root;
    for (let i = 0; i < 5; i++) {
        const p = path.join(dir, '.gitignore');
        if (fs.existsSync(p)) {
            const lines = fs
                .readFileSync(p, 'utf-8')
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l && !l.startsWith('#'));
            patterns.push(...lines);
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return patterns;
}

function isIgnored(filePath: string, patterns: string[]): boolean {
    const base = path.basename(filePath);
    return patterns.some((pattern) => {
        if (pattern.startsWith('#')) return false;
        // Exact base name match (e.g. ".env")
        if (pattern === base) return true;
        if (pattern === filePath) return true;
        // Glob: ".env*" matches ".env.local", ".env.production" etc.
        if (pattern.endsWith('*')) {
            const prefix = pattern.slice(0, -1);
            if (base.startsWith(prefix) || filePath.startsWith(prefix)) return true;
        }
        // "*.env" matches files ending in .env
        if (pattern.startsWith('*')) {
            const suffix = pattern.slice(1);
            if (base.endsWith(suffix)) return true;
        }
        return false;
    });
}

function findLocalEnvFiles(root: string): string[] {
    const found: string[] = [];
    try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isFile() && isDangerousEnvFile(entry.name)) {
                found.push(entry.name);
            }
        }
    } catch {
        /* ignore */
    }
    return found;
}

export const caEnv003: Rule = {
    id: 'CA-ENV003',
    description:
        '.env file exists on disk but is not covered by .gitignore — one "git add ." away from committing secrets.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const envFiles = findLocalEnvFiles(ctx.repoRoot);
        if (envFiles.length === 0) return [];

        const patterns = readGitignorePatterns(ctx.repoRoot);
        // No early return when patterns is empty — an absent or empty .gitignore means
        // NOTHING is ignored, so every .env file is at risk and should be flagged.

        const findings: Finding[] = [];
        for (const file of envFiles) {
            if (!isIgnored(file, patterns)) {
                findings.push({
                    ruleId: 'CA-ENV003',
                    severity: 'error',
                    file,
                    message: `"${file}" exists but is not covered by .gitignore. A "git add ." will commit it and expose any secrets it contains.`,
                    fix: `Add "${file}" or ".env*" to .gitignore.`,
                });
            }
        }
        return findings;
    },
};
