import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

// Extensions where float equality comparisons are meaningful
const CSTYLE_EXTS = new Set([
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
]);
const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PYTHON_EXTS = new Set(['.py']);

function stripTemplateLiterals(src: string): string {
    return src.replace(/`(?:[^`\\]|\\.)*`/gs, '``');
}

// Strip C-style line comment from a single line (preserves position length)
function stripLineComment(line: string): string {
    const idx = line.indexOf('//');
    return idx === -1 ? line : line.slice(0, idx);
}

// Strip Python # comment from a single line
function stripHashComment(line: string): string {
    const idx = line.indexOf('#');
    return idx === -1 ? line : line.slice(0, idx);
}

// Check if a stripped line contains a float literal adjacent to an equality operator.
// Returns the matched snippet or null.
function checkCStyleLine(line: string): string | null {
    // float op: 0.5 == x  or  x == 0.5  (operators ===, !==, ==, !=)
    // Float on right side of operator
    const rightMatch = /(?:===|!==|==|!=)\s*[-+]?(\d+\.\d*[1-9]\d*)[fFdD]?(?!\w|\.)/.exec(line);
    if (rightMatch) return rightMatch[0].trim();

    // Float on left side of operator
    const leftMatch = /(?<!\w)[-+]?(\d+\.\d*[1-9]\d*)[fFdD]?\s*(?:===|!==|==|!=)/.exec(line);
    if (leftMatch) return leftMatch[0].trim();

    return null;
}

function checkPythonLine(line: string): string | null {
    const rightMatch = /(?:==|!=)\s*[-+]?(\d+\.\d*[1-9]\d*)(?!\w|\.)/.exec(line);
    if (rightMatch) return rightMatch[0].trim();

    const leftMatch = /(?<!\w)[-+]?(\d+\.\d*[1-9]\d*)\s*(?:==|!=)/.exec(line);
    if (leftMatch) return leftMatch[0].trim();

    return null;
}

// Suppress false positive: division-like context in JS where `/ 0.5` might appear
// If the matched snippet starts with a division operator, skip it (handled by excluding `/` from ops)
// Already handled: our ops are === !== == != which don't include /

export const isoRel003: Rule = {
    id: 'ISO-REL003',
    description:
        'Floating-point value compared for exact equality (MISRA-C advisory Rule 14.1, CWE-1339). ' +
        'IEEE 754 arithmetic makes exact float comparisons unreliable; use an epsilon/tolerance check instead. ' +
        'Applies to JS/TS/Java/C/C++ (===, !==, ==, !=) and Python (==, !=).',
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
            const isCStyle = CSTYLE_EXTS.has(ext);
            const isPython = PYTHON_EXTS.has(ext);

            if (!isCStyle && !isPython) continue;

            let content: string;
            try {
                content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8');
            } catch {
                continue;
            }

            if (JS_TS_EXTS.has(ext)) content = stripTemplateLiterals(content);
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const stripped = isCStyle ? stripLineComment(lines[i]) : stripHashComment(lines[i]);

                const match = isCStyle ? checkCStyleLine(stripped) : checkPythonLine(stripped);

                if (match) {
                    findings.push({
                        ruleId: 'ISO-REL003',
                        severity: 'warn',
                        file: relPath,
                        line: i + 1,
                        message:
                            `Exact equality comparison with a floating-point literal: \`${match}\`. ` +
                            'IEEE 754 arithmetic means this comparison may never be true due to rounding.',
                        fix: 'Use an epsilon/tolerance check: Math.abs(a - b) < Number.EPSILON (JS) or abs(a - b) < 1e-9 (Python).',
                    });
                }
            }
        }

        return findings;
    },
};
