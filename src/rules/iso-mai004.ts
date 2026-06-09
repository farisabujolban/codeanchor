import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../engine.js';
import { isExcluded } from '../util/exclude.js';

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java']);

// Basenames that are intentionally barrel/entry files — don't flag these
const BARREL_BASENAMES = new Set([
    'index.ts',
    'index.tsx',
    'index.js',
    'index.jsx',
    'index.mjs',
    'index.cjs',
    'mod.ts',
    'mod.js',
    '__init__.py',
]);

function isTestFile(relPath: string): boolean {
    const base = path.basename(relPath);
    // Check path segments for test directory markers
    if (relPath.includes('/__tests__/') || relPath.includes('/test/') || relPath.includes('/tests/')) {
        return true;
    }
    // Check filename markers
    if (base.includes('.test.') || base.includes('.spec.')) return true;
    if (base.startsWith('test_') || base.endsWith('_test.py')) return true;
    if (base.endsWith('Test.java') || base.endsWith('Spec.java') || base.endsWith('Tests.java')) return true;
    // Windows-style paths (unlikely in git, but defensive)
    if (relPath.includes('\\__tests__\\') || relPath.includes('\\test\\') || relPath.includes('\\tests\\')) {
        return true;
    }
    return false;
}

// Derive candidate test file paths (repo-relative, forward-slash) for a given source file.
// Mirrors the logic in ca-test001.ts findTestFile but works with a tracked-file Set.
function testCandidates(relPath: string): string[] {
    const dir = path.dirname(relPath).replace(/\\/g, '/');
    const base = path.basename(relPath);
    const ext = path.extname(base);
    const stem = base.slice(0, -ext.length);
    const prefix = dir === '.' ? '' : dir + '/';

    if (ext === '.py') {
        return [
            `${prefix}test_${stem}.py`,
            `${prefix}${stem}_test.py`,
            `${prefix}tests/test_${stem}.py`,
            `tests/test_${stem}.py`,
        ];
    }

    if (ext === '.java') {
        return [`${prefix}${stem}Test.java`, `${prefix}${stem}Spec.java`];
    }

    // JS/TS and variants
    return [
        `${prefix}${stem}.test${ext}`,
        `${prefix}${stem}.spec${ext}`,
        `${prefix}__tests__/${stem}${ext}`,
        `${prefix}${stem}.test.ts`,
        `${prefix}${stem}.test.js`,
        `${prefix}${stem}.spec.ts`,
        `${prefix}${stem}.spec.js`,
    ];
}

export const isoMai004: Rule = {
    id: 'ISO-MAI004',
    description:
        'Source file has no corresponding test file in the repository (ISO/IEC 25010 Testability). ' +
        'Every tracked source module should have at least one test counterpart. ' +
        'Unlike CA-TEST001 (which checks only hot files), this audits all tracked source files.',
    defaultSeverity: 'info',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        let trackedFiles: string[];
        try {
            trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
                .split('\n')
                .filter(Boolean);
        } catch {
            return [];
        }

        const trackedSet = new Set(trackedFiles);
        const findings: Finding[] = [];

        for (const relPath of trackedFiles) {
            if (isExcluded(relPath, ctx.config.exclude)) continue;

            const ext = path.extname(relPath);
            if (!SOURCE_EXTS.has(ext)) continue;

            // Skip type declaration files
            if (relPath.endsWith('.d.ts')) continue;

            // Skip barrel/entry files
            if (BARREL_BASENAMES.has(path.basename(relPath))) continue;

            // Skip files that are themselves tests
            if (isTestFile(relPath)) continue;

            // Check if any candidate test file exists in the tracked set
            const candidates = testCandidates(relPath);
            const hasTest = candidates.some((c) => trackedSet.has(c));

            if (!hasTest) {
                findings.push({
                    ruleId: 'ISO-MAI004',
                    severity: 'info',
                    file: relPath,
                    message: `No test file found for "${relPath}" (ISO/IEC 25010 Testability).`,
                    fix: `Add a test file — e.g. ${candidates[0]}.`,
                });
            }
        }

        return findings;
    },
};
