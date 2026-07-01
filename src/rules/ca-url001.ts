import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

const SOURCE_EXTS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.go',
    '.java',
    '.rb',
    '.swift',
    '.kt',
]);

const PYTHON_EXTS = new Set(['.py', '.rb']);

const LOCALHOST_RE = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/g;

function stripCComments(s: string): string {
    return s
        .replace(/(?<!:)\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function stripHashComments(s: string): string {
    return s.replace(/#[^\n]*/g, (m) => ' '.repeat(m.length));
}

function lineAt(content: string, pos: number): number {
    let line = 1;
    for (let i = 0; i < pos; i++) if (content[i] === '\n') line++;
    return line;
}

function isTestFile(relPath: string): boolean {
    const n = relPath.replace(/\\/g, '/');
    return (
        n.includes('.test.') ||
        n.includes('.spec.') ||
        /[./](test|spec)[./]/.test(n) ||
        /\/__tests?__\//.test(n) ||
        /\/__mocks?__\//.test(n) ||
        /\/(test|tests|spec|specs)\//.test(n)
    );
}

export const caUrl001: Rule = {
    id: 'CA-URL001',
    description: 'Hardcoded localhost or 127.0.0.1 URL found in non-test source file.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr', 'staged'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        let filePaths: string[];

        if (ctx.mode === 'staged' && ctx.stagedDiffs) {
            filePaths = ctx.stagedDiffs.filter((d) => d.status !== 'deleted').map((d) => d.path);
        } else {
            try {
                filePaths = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
                    .split('\n')
                    .filter(Boolean);
            } catch {
                return [];
            }
        }

        const findings: Finding[] = [];

        for (const relPath of filePaths) {
            if (isExcluded(relPath, ctx.config.exclude)) continue;
            if (isTestFile(relPath)) continue;
            if (!SOURCE_EXTS.has(path.extname(relPath))) continue;

            let content: string;
            try {
                content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8');
            } catch {
                continue;
            }

            const stripped = PYTHON_EXTS.has(path.extname(relPath))
                ? stripHashComments(content)
                : stripCComments(content);

            LOCALHOST_RE.lastIndex = 0;
            const seenLines = new Set<number>();
            let m: RegExpExecArray | null;
            while ((m = LOCALHOST_RE.exec(stripped)) !== null) {
                const line = lineAt(stripped, m.index);
                if (seenLines.has(line)) continue;
                seenLines.add(line);
                findings.push({
                    ruleId: 'CA-URL001',
                    severity: 'error',
                    file: relPath,
                    line,
                    message: `Hardcoded "${m[0]}" found in source file. This will break in any non-local environment.`,
                    fix: 'Replace with an environment variable (e.g. process.env.API_URL or equivalent).',
                });
            }
        }

        return findings;
    },
};
