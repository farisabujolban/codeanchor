import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding, Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

const ALL_EXTS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.java',
    '.c',
    '.h',
    '.cpp',
    '.hpp',
    '.cc',
    '.cs',
    '.py',
]);

const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// Matches a single- or double-quoted string containing \\ (two backslashes in source =
// one Windows path separator) followed by a word/path character.
// Four backslashes in the regex literal → two in the pattern → matches two consecutive
// backslash characters in the input string.
const WIN_PATH_RE = /["'][^"'\n]*\\\\[A-Za-z0-9_.~][^"'\n]*["']/;

function stripTemplateLiterals(src: string): string {
    return src.replace(/`(?:[^`\\]|\\.)*`/gs, '``');
}

function stripLineComment(line: string): string {
    const idx = line.indexOf('//');
    return idx === -1 ? line : line.slice(0, idx);
}

function stripHashComment(line: string): string {
    const idx = line.indexOf('#');
    return idx === -1 ? line : line.slice(0, idx);
}

export const isoPor001: Rule = {
    id: 'ISO-POR001',
    description:
        'Hardcoded Windows path separator (\\) in a string literal (ISO 25010 Portability). ' +
        'Backslash separators break cross-platform builds. ' +
        'Use path.join() / os.path.join() / Paths.get() with forward slashes instead.',
    defaultSeverity: 'warn',
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
            if (/[./](test|spec)[./]|\.test\.|\.spec\.|__tests?__|__mocks?__/.test(relPath)) continue;

            const ext = path.extname(relPath);
            if (!ALL_EXTS.has(ext)) continue;

            let content: string;
            try {
                content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8');
            } catch {
                continue;
            }

            if (JS_TS_EXTS.has(ext)) content = stripTemplateLiterals(content);
            const lines = content.split('\n');
            const isPython = ext === '.py';

            for (let i = 0; i < lines.length; i++) {
                const stripped = isPython ? stripHashComment(lines[i]) : stripLineComment(lines[i]);
                const match = WIN_PATH_RE.exec(stripped);
                if (match) {
                    findings.push({
                        ruleId: 'ISO-POR001',
                        severity: 'warn',
                        file: relPath,
                        line: i + 1,
                        message:
                            `Hardcoded Windows path separator (\\) in string literal: \`${match[0]}\`. ` +
                            'Backslash separators break cross-platform portability.',
                        fix: 'Use path.join() / os.path.join() / Paths.get() with forward slashes instead.',
                    });
                }
            }
        }

        return findings;
    },
};
