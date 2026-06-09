import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PYTHON_EXTS = new Set(['.py']);
const JAVA_EXTS = new Set(['.java']);

function stripTemplateLiterals(src: string): string {
    return src.replace(/`(?:[^`\\]|\\.)*`/gs, '``');
}

// Strip C-style comments, preserving newlines for line-number accuracy
function stripCComments(s: string): string {
    return s
        .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
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

// A regex pattern is ReDoS-vulnerable when it contains nested quantifiers:
// a group that itself contains a quantifier (+, *, {n,}) and the group is
// then also quantified externally. Examples: (a+)+  (.*)*  ([a-z]+){2,}
//
// Detection heuristic: look for \( ... [+*{] ... \) followed by [+*{]
// This is the core ReDoS "nested quantifier" pattern.
//
// We only check one level deep. More complex patterns (e.g., alternation
// ambiguity) are not detected to keep the false positive rate low.
const REDOS_NESTED_QUANTIFIER_RE = /\([^()]*[+*][^()]*\)\s*[+*{]/;

// Secondary: alternation where BOTH alternatives are quantified: (a+|b+)+
// This is already caught by the primary pattern if the outer quantifier is present.

function isReDoSVulnerable(pattern: string): boolean {
    return REDOS_NESTED_QUANTIFIER_RE.test(pattern);
}

// Extract string content from a quoted string starting at a given position.
// Returns [content, endPos] or null if not a valid quoted string.
function extractQuotedString(s: string, startPos: number): [string, number] | null {
    const q = s[startPos];
    if (q !== '"' && q !== "'") return null;
    let i = startPos + 1;
    let result = '';
    while (i < s.length) {
        if (s[i] === '\\') {
            result += s[i + 1] ?? '';
            i += 2;
            continue;
        }
        if (s[i] === q) return [result, i];
        result += s[i];
        i++;
    }
    return null;
}

interface RegexFinding {
    pattern: string;
    line: number;
}

// JS/TS: extract patterns from new RegExp('...') and new RegExp("...") calls
// Also extracts from /pattern/flags inline literals by looking for context markers.
function extractJsTsRegexPatterns(stripped: string): RegexFinding[] {
    const results: RegexFinding[] = [];

    // new RegExp('...') or new RegExp("...")
    const NEW_REGEXP_RE = /\bnew\s+RegExp\s*\(\s*(['"])/g;
    let m: RegExpExecArray | null;
    NEW_REGEXP_RE.lastIndex = 0;
    while ((m = NEW_REGEXP_RE.exec(stripped)) !== null) {
        const quotePos = m.index + m[0].length - 1;
        const parsed = extractQuotedString(stripped, quotePos);
        if (!parsed) continue;
        const [pattern] = parsed;
        results.push({ pattern, line: lineAt(stripped, m.index) });
    }

    // Inline regex literals: /pattern/flags in known contexts
    // Contexts: after = ( , return  .test( .match( .replace( .search( .split( .exec(
    const INLINE_RE_CTX =
        /(?:=|[,(]|return\s+|\.\s*(?:test|match|replace|search|split|exec)\s*\()\s*(\/(?:[^/\n\\]|\\.)+\/[gimsuy]*)/g;
    INLINE_RE_CTX.lastIndex = 0;
    while ((m = INLINE_RE_CTX.exec(stripped)) !== null) {
        const literal = m[1];
        // Extract the pattern between the outer slashes
        const lastSlash = literal.lastIndexOf('/');
        const pattern = literal.slice(1, lastSlash);
        results.push({ pattern, line: lineAt(stripped, m.index) });
    }

    return results;
}

// Python: extract patterns from re.compile(r'...'), re.match(r'...', ...) etc.
// Handles both raw strings r'...' and regular strings '...' / "..."
function extractPythonRegexPatterns(stripped: string): RegexFinding[] {
    const results: RegexFinding[] = [];

    // re.compile(...) re.match(...) re.search(...) re.fullmatch(...) re.findall(...) re.sub(...) re.split(...)
    // The first argument is the pattern
    const RE_FUNC = /\bre\s*\.\s*(?:compile|match|search|fullmatch|findall|sub|subn|split|finditer)\s*\(\s*r?(['"])/g;
    let m: RegExpExecArray | null;
    RE_FUNC.lastIndex = 0;
    while ((m = RE_FUNC.exec(stripped)) !== null) {
        const quotePos = m.index + m[0].length - 1;
        const parsed = extractQuotedString(stripped, quotePos);
        if (!parsed) continue;
        const [pattern] = parsed;
        results.push({ pattern, line: lineAt(stripped, m.index) });
    }

    return results;
}

// Java: extract patterns from Pattern.compile("..."), String.matches("..."),
// replaceAll("..."), split("...")
function extractJavaRegexPatterns(stripped: string): RegexFinding[] {
    const results: RegexFinding[] = [];

    const JAVA_RE = /\b(?:Pattern\.compile|(?:String\.)?matches|replaceAll|replaceFirst|split)\s*\(\s*"/g;
    let m: RegExpExecArray | null;
    JAVA_RE.lastIndex = 0;
    while ((m = JAVA_RE.exec(stripped)) !== null) {
        const quotePos = m.index + m[0].length - 1;
        const parsed = extractQuotedString(stripped, quotePos);
        if (!parsed) continue;
        const [pattern] = parsed;
        results.push({ pattern, line: lineAt(stripped, m.index) });
    }

    return results;
}

export const isoSec002: Rule = {
    id: 'ISO-SEC002',
    description:
        'ReDoS-vulnerable regex pattern detected — nested quantifiers can cause catastrophic backtracking ' +
        '(CWE-1333, ISO/IEC 25010 Performance Efficiency). ' +
        'Patterns like (a+)+ allow exponential matching time on crafted inputs. ' +
        'Applies to JS/TS, Python (re module), and Java (Pattern.compile).',
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
            const isJsTs = JS_TS_EXTS.has(ext);
            const isPython = PYTHON_EXTS.has(ext);
            const isJava = JAVA_EXTS.has(ext);

            if (!isJsTs && !isPython && !isJava) continue;

            let content: string;
            try {
                content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8');
            } catch {
                continue;
            }

            if (isJsTs) content = stripTemplateLiterals(content);
            const stripped = isJsTs || isJava ? stripCComments(content) : stripHashComments(content);

            const regexItems = isJsTs
                ? extractJsTsRegexPatterns(stripped)
                : isPython
                  ? extractPythonRegexPatterns(stripped)
                  : extractJavaRegexPatterns(stripped);

            for (const { pattern, line } of regexItems) {
                if (isReDoSVulnerable(pattern)) {
                    findings.push({
                        ruleId: 'ISO-SEC002',
                        severity: 'warn',
                        file: relPath,
                        line,
                        message:
                            `ReDoS-vulnerable regex pattern: /${pattern}/ contains nested quantifiers ` +
                            '(e.g. (X+)+) that can cause catastrophic backtracking (CWE-1333).',
                        fix: 'Rewrite using atomic groups, possessive quantifiers, or simplify the pattern to remove nested repetition.',
                    });
                }
            }
        }

        return findings;
    },
};
