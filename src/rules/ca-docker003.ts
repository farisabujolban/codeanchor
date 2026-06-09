import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

function findDockerfiles(root: string): string[] {
    const files: string[] = [];
    try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isFile() && (entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.'))) {
                files.push(path.join(root, entry.name));
            }
        }
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const subDir = path.join(root, entry.name);
            try {
                for (const sub of fs.readdirSync(subDir, { withFileTypes: true })) {
                    if (sub.isFile() && (sub.name === 'Dockerfile' || sub.name.startsWith('Dockerfile.'))) {
                        files.push(path.join(subDir, sub.name));
                    }
                }
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* ignore unreadable root */
    }
    return files;
}

function extractMajor(version: string): number | null {
    const m = version.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

interface RuntimeRef {
    major: number;
    source: string;
}

function readNodeRef(root: string): RuntimeRef | null {
    for (const file of ['.nvmrc', '.node-version']) {
        const p = path.join(root, file);
        if (fs.existsSync(p)) {
            const major = extractMajor(fs.readFileSync(p, 'utf-8').trim());
            if (major !== null) return { major, source: file };
        }
    }
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { engines?: { node?: string } };
            if (pkg.engines?.node) {
                const major = extractMajor(pkg.engines.node);
                if (major !== null) return { major, source: 'package.json engines.node' };
            }
        } catch {
            /* ignore */
        }
    }
    return null;
}

function readPythonRef(root: string): RuntimeRef | null {
    const p = path.join(root, '.python-version');
    if (!fs.existsSync(p)) return null;
    const major = extractMajor(fs.readFileSync(p, 'utf-8').trim());
    return major !== null ? { major, source: '.python-version' } : null;
}

function readGoRef(root: string): RuntimeRef | null {
    const p = path.join(root, 'go.mod');
    if (!fs.existsSync(p)) return null;
    const m = fs.readFileSync(p, 'utf-8').match(/^go\s+([\d.]+)/m);
    if (!m) return null;
    const major = extractMajor(m[1]);
    return major !== null ? { major, source: 'go.mod' } : null;
}

const RUNTIME_READERS: Array<{ runtimeNames: string[]; read: (root: string) => RuntimeRef | null }> = [
    { runtimeNames: ['node'], read: readNodeRef },
    { runtimeNames: ['python'], read: readPythonRef },
    { runtimeNames: ['golang', 'go'], read: readGoRef },
];

export const caDocker003: Rule = {
    id: 'CA-DOCKER003',
    description:
        'Dockerfile FROM runtime version does not match .nvmrc, .python-version, go.mod, or package.json engines.',
    defaultSeverity: 'warn',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const refs = new Map<string, RuntimeRef>();
        for (const { runtimeNames, read } of RUNTIME_READERS) {
            const ref = read(ctx.repoRoot);
            if (ref) for (const name of runtimeNames) refs.set(name, ref);
        }
        if (refs.size === 0) return [];

        const findings: Finding[] = [];

        for (const dockerFile of findDockerfiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, dockerFile);
            if (isExcluded(relPath, ctx.config.exclude)) continue;

            let content: string;
            try {
                content = fs.readFileSync(dockerFile, 'utf-8');
            } catch {
                continue;
            }

            const lines = content.split('\n');
            // Only check the final FROM (final build stage)
            let lastFromIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (/^\s*FROM\s+/i.test(lines[i])) lastFromIdx = i;
            }
            if (lastFromIdx < 0) continue;

            const line = lines[lastFromIdx].trim();
            const fromMatch = line.match(/^FROM\s+([\w./-]+):([\w.-]+)/i);
            if (!fromMatch) continue;

            const image = fromMatch[1].toLowerCase();
            const tag = fromMatch[2];

            // Determine runtime from image name
            let runtimeKey: string | null = null;
            if (image === 'node' || image.endsWith('/node')) runtimeKey = 'node';
            else if (image === 'python' || image.endsWith('/python')) runtimeKey = 'python';
            else if (image === 'golang' || image.endsWith('/golang')) runtimeKey = 'golang';

            if (!runtimeKey) continue;
            const ref = refs.get(runtimeKey);
            if (!ref) continue;

            const dockerMajor = extractMajor(tag);
            if (dockerMajor === null) continue;

            if (dockerMajor !== ref.major) {
                findings.push({
                    ruleId: 'CA-DOCKER003',
                    severity: 'warn',
                    file: relPath,
                    line: lastFromIdx + 1,
                    message: `Dockerfile FROM ${image}:${tag} (major ${dockerMajor}) but ${ref.source} specifies major ${ref.major}.`,
                    fix: `Update the FROM tag to use major version ${ref.major}.`,
                });
            }
        }

        return findings;
    },
};
