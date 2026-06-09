import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

// JS/TS is intentionally excluded: JS has no typed exception hierarchy,
// so every catch block catches the broadest possible type — flagging all of them
// would produce near-100% false positives.
const PYTHON_EXTS = new Set(['.py']);
const JAVA_EXTS = new Set(['.java']);

// Strip C-style comments, preserving newlines
function stripCComments(s: string): string {
    return s
        .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function lineAt(content: string, pos: number): number {
    let line = 1;
    for (let i = 0; i < pos; i++) if (content[i] === '\n') line++;
    return line;
}

// Find the position of the opening { that belongs to this catch block.
// Searches forward from startPos, tracking () depth to skip past the exception binding.
function findBodyOpen(content: string, startPos: number): number {
    let depth = 0;
    const limit = Math.min(startPos + 500, content.length);
    for (let i = startPos; i < limit; i++) {
        const ch = content[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === '{' && depth === 0) return i;
        else if (ch === ';' && depth === 0) return -1;
    }
    return -1;
}

// Find matching closing } for the { at openPos.
function findBodyClose(content: string, openPos: number): number {
    let depth = 1;
    let i = openPos + 1;
    while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') depth--;
        i++;
    }
    return depth === 0 ? i - 1 : -1;
}

interface BroadCatch {
    line: number;
    exceptionType: string;
}

// Java: find catch (Exception|Throwable|RuntimeException ...) blocks that don't re-throw.
function findJavaBroadCatches(content: string, stripped: string): BroadCatch[] {
    const results: BroadCatch[] = [];

    // Match catch (BroadType varName) — covers Exception, Throwable, RuntimeException
    const CATCH_RE = /\bcatch\s*\(\s*(Exception|Throwable|RuntimeException)\s+\w+\s*\)/g;
    let m: RegExpExecArray | null;
    CATCH_RE.lastIndex = 0;

    while ((m = CATCH_RE.exec(stripped)) !== null) {
        const catchLine = lineAt(content, m.index);
        const exceptionType = m[1];

        const bodyOpen = findBodyOpen(stripped, m.index + m[0].length);
        if (bodyOpen === -1) continue;
        const bodyClose = findBodyClose(stripped, bodyOpen);
        if (bodyClose === -1) continue;

        const body = stripped.slice(bodyOpen + 1, bodyClose);

        // If body contains a `throw` keyword → the exception is being re-thrown → skip
        if (/\bthrow\b/.test(body)) continue;

        results.push({ line: catchLine, exceptionType });
    }

    return results;
}

// Python: find except Exception / except BaseException / bare except: blocks
// that don't contain a raise statement.
function findPythonBroadExcepts(content: string): BroadCatch[] {
    const results: BroadCatch[] = [];
    const lines = content.split('\n');

    // Matches bare except: or except Exception/BaseException (with optional "as e")
    const EXCEPT_RE = /^(\s*)except(?:\s+(Exception|BaseException))?\s*(?:as\s+\w+)?\s*:/;

    for (let i = 0; i < lines.length; i++) {
        const m = EXCEPT_RE.exec(lines[i]);
        if (!m) continue;

        const exceptIndent = m[1].length;
        const exceptionType = m[2] ?? 'bare except';

        // Collect body lines — those indented more than the except line
        const bodyLines: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
            const l = lines[j];
            const trimmed = l.trim();
            if (trimmed.length === 0) {
                bodyLines.push(l);
                j++;
                continue;
            } // blank
            if (trimmed.startsWith('#')) {
                bodyLines.push(l);
                j++;
                continue;
            } // comment
            const indent = l.length - l.trimStart().length;
            if (indent > exceptIndent) {
                bodyLines.push(l);
                j++;
            } else break;
        }

        const bodyText = bodyLines.join('\n');

        // If body contains `raise` → the exception is re-raised → skip
        if (/\braise\b/.test(bodyText)) {
            i = j - 1;
            continue;
        }

        results.push({ line: i + 1, exceptionType });
        i = j - 1;
    }

    return results;
}

export const isoRel004: Rule = {
    id: 'ISO-REL004',
    description:
        'Catch block catches a generic/base exception type without re-throwing (ISO 5055 ASCRM-CWE-396, CWE-396). ' +
        'Catching Exception, Throwable (Java) or bare except/Exception (Python) swallows unexpected errors, ' +
        'masking bugs. Applies to Java and Python only (JS/TS lacks typed exception hierarchy).',
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

            const ext = path.extname(relPath);
            const isJava = JAVA_EXTS.has(ext);
            const isPython = PYTHON_EXTS.has(ext);

            if (!isJava && !isPython) continue;

            let content: string;
            try {
                content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8');
            } catch {
                continue;
            }

            const matches = isJava
                ? findJavaBroadCatches(content, stripCComments(content))
                : findPythonBroadExcepts(content);

            for (const { line, exceptionType } of matches) {
                findings.push({
                    ruleId: 'ISO-REL004',
                    severity: 'warn',
                    file: relPath,
                    line,
                    message:
                        `Broad exception type \`${exceptionType}\` caught without re-throwing (CWE-396). ` +
                        'This swallows unexpected errors and masks bugs.',
                    fix: 'Catch the most specific exception type possible, or re-throw after logging.',
                });
            }
        }

        return findings;
    },
};
