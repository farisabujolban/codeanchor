import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

const DEFAULT_THRESHOLD = 15;

// Barrel/index files are designed to be widely imported — skip flagging them
const BARREL_BASENAMES = new Set([
    'index.ts',
    'index.tsx',
    'index.js',
    'index.jsx',
    'index.mjs',
    'index.cjs',
    'mod.ts',
    'mod.js',
]);

const JS_TS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const JS_TS_EXT_SET = new Set(JS_TS_EXTS);

// Only relative imports create intra-repo edges
const RELATIVE_FROM_RE = /\bfrom\s+['"](\.[^'"]+)['"]/g;
const RELATIVE_REQUIRE_RE = /\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const RELATIVE_DYNAMIC_RE = /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function resolveSpecifier(fromFile: string, specifier: string, trackedSet: Set<string>): string | null {
    const fromDir = path.dirname(fromFile);
    const cleanSpec = specifier.split('?')[0].split('#')[0];
    const base = path.join(fromDir, cleanSpec).replace(/\\/g, '/');

    if (trackedSet.has(base)) return base;

    for (const ext of JS_TS_EXTS) {
        const candidate = base + ext;
        if (trackedSet.has(candidate)) return candidate;
        if (ext === '.js' && base.endsWith('.js')) {
            const tsVersion = base.slice(0, -3) + '.ts';
            if (trackedSet.has(tsVersion)) return tsVersion;
            const tsxVersion = base.slice(0, -3) + '.tsx';
            if (trackedSet.has(tsxVersion)) return tsxVersion;
        }
    }

    for (const ext of JS_TS_EXTS) {
        const candidate = base + '/index' + ext;
        if (trackedSet.has(candidate)) return candidate;
    }

    return null;
}

function extractSpecifiers(content: string): string[] {
    const specifiers: string[] = [];
    for (const re of [RELATIVE_FROM_RE, RELATIVE_REQUIRE_RE, RELATIVE_DYNAMIC_RE]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) specifiers.push(m[1]);
    }
    return specifiers;
}

export const isoMai003: Rule = {
    id: 'ISO-MAI003',
    description:
        'Module has high afferent coupling — too many internal files import it (ISO/IEC 25010 Modifiability, ' +
        'CISQ ASCMM-MNT-11). A module with many dependents has a large blast radius when changed. ' +
        'Configurable via { "ISO-MAI003": { "threshold": 15 } }.',
    defaultSeverity: 'info',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const ruleCfg = ctx.config.rules['ISO-MAI003'];
        const threshold =
            ruleCfg && typeof ruleCfg === 'object'
                ? (((ruleCfg as Record<string, unknown>).threshold as number | undefined) ?? DEFAULT_THRESHOLD)
                : DEFAULT_THRESHOLD;

        let trackedFiles: string[];
        try {
            trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
                .split('\n')
                .filter(Boolean);
        } catch {
            return [];
        }

        const trackedSet = new Set(trackedFiles);

        // Build reverse import map: imported file → set of importer files
        const afferentMap = new Map<string, Set<string>>();

        for (const relPath of trackedFiles) {
            if (!JS_TS_EXT_SET.has(path.extname(relPath))) continue;

            let content: string;
            try {
                content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8');
            } catch {
                continue;
            }

            for (const specifier of extractSpecifiers(content)) {
                const resolved = resolveSpecifier(relPath, specifier, trackedSet);
                if (!resolved || resolved === relPath) continue;

                let importers = afferentMap.get(resolved);
                if (!importers) {
                    importers = new Set();
                    afferentMap.set(resolved, importers);
                }
                importers.add(relPath);
            }
        }

        const findings: Finding[] = [];

        for (const [importedFile, importers] of afferentMap) {
            if (isExcluded(importedFile, ctx.config.exclude)) continue;

            const base = path.basename(importedFile);

            // Skip barrel files (designed to be widely imported)
            if (BARREL_BASENAMES.has(base)) continue;

            // Skip type declaration files
            if (base.endsWith('.d.ts')) continue;

            if (importers.size > threshold) {
                findings.push({
                    ruleId: 'ISO-MAI003',
                    severity: 'info',
                    file: importedFile,
                    message:
                        `"${importedFile}" is imported by ${importers.size} internal modules (threshold: ${threshold}). ` +
                        'High afferent coupling increases blast radius when this module changes.',
                    fix:
                        'Consider splitting this module into smaller, more focused units to reduce the number of dependents, ' +
                        'or acknowledge this as a stable shared utility.',
                });
            }
        }

        return findings;
    },
};
