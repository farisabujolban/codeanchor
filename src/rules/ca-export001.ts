import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

interface IndexDetector {
    fileNames: string[];
    parseExports(content: string): Set<string>;
}

function parseJsTsExports(content: string): Set<string> {
    const symbols = new Set<string>();

    // export const/function/class/type/interface/enum/abstract class Name
    for (const m of content.matchAll(
        /^export\s+(?:default\s+)?(?:(?:abstract\s+)?class|function\*?|const|let|var|type|interface|enum)\s+(\w+)/gm,
    )) {
        symbols.add(m[1]);
    }

    // export { Foo, Bar as Baz }
    for (const m of content.matchAll(/^export\s*\{([^}]+)\}/gm)) {
        for (const part of m[1].split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            // "Bar as Baz" → use Baz (the exported name), "Foo" → Foo
            const alias = trimmed.match(/(?:\w+\s+as\s+)?(\w+)$/);
            if (alias) symbols.add(alias[1]);
        }
    }

    // export * from './module' and export * as ns from './module'
    for (const m of content.matchAll(/^export\s+\*(?:\s+as\s+(\w+))?\s+from\s+['"]([^'"]+)['"]/gm)) {
        const ns = m[1];
        const src = m[2];
        symbols.add(ns ? `* as ${ns} from '${src}'` : `* from '${src}'`);
    }

    return symbols;
}

const INDEX_DETECTORS: IndexDetector[] = [
    {
        fileNames: ['src/index.ts', 'src/index.js', 'src/index.mjs', 'index.ts', 'index.js', 'index.mjs'],
        parseExports: parseJsTsExports,
    },
    // Future: { fileNames: ['__init__.py'], parseExports: parsePythonExports }
    // Future: { fileNames: ['lib.rs'], parseExports: parseRustExports }
];

function getGitPreviousContent(repoRoot: string, relPath: string): string | null {
    try {
        return execFileSync('git', ['show', `HEAD:${relPath}`], {
            cwd: repoRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
        });
    } catch {
        return null;
    }
}

export const caExport001: Rule = {
    id: 'CA-EXPORT001',
    description:
        'A symbol was silently removed from a public module index file — potential breaking change if this package is published. (JS/TS in v1; extend via INDEX_DETECTORS.)',
    defaultSeverity: 'warn',
    applicableModes: ['pr', 'staged'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        for (const detector of INDEX_DETECTORS) {
            for (const relIndexPath of detector.fileNames) {
                const absPath = path.join(ctx.repoRoot, relIndexPath);
                if (!fs.existsSync(absPath)) continue;
                if (isExcluded(relIndexPath, ctx.config.exclude)) continue;

                const previousContent = getGitPreviousContent(ctx.repoRoot, relIndexPath);
                if (!previousContent) continue; // New file — nothing to compare

                let currentContent: string;
                try {
                    currentContent = fs.readFileSync(absPath, 'utf-8');
                } catch {
                    continue;
                }

                const prev = detector.parseExports(previousContent);
                const curr = detector.parseExports(currentContent);

                for (const symbol of prev) {
                    if (!curr.has(symbol)) {
                        findings.push({
                            ruleId: 'CA-EXPORT001',
                            severity: 'warn',
                            file: relIndexPath,
                            message: `Export "${symbol}" was removed from the public module index — breaking change if this package is published.`,
                            fix: `Re-export "${symbol}" or document the removal in CHANGELOG.md as a BREAKING CHANGE.`,
                        });
                    }
                }
            }
        }

        return findings;
    },
};
