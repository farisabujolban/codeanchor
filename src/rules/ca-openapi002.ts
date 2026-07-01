import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Finding, Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

const SPEC_LOCATIONS = [
    'openapi.yaml',
    'openapi.yml',
    'swagger.yaml',
    'swagger.json',
    'docs/openapi.yaml',
    'docs/openapi.yml',
    'docs/swagger.yaml',
    'docs/swagger.json',
    'api/openapi.yaml',
    'api/swagger.yaml',
];

function findSpecFile(root: string): { absPath: string; relPath: string } | null {
    for (const loc of SPEC_LOCATIONS) {
        const abs = path.join(root, loc);
        if (fs.existsSync(abs)) return { absPath: abs, relPath: loc };
    }
    return null;
}

function parseSpec(absPath: string): unknown {
    const raw = fs.readFileSync(absPath, 'utf-8');
    if (!absPath.endsWith('.json')) return yaml.load(raw);
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function resolveJsonPointer(doc: unknown, pointer: string): boolean {
    // pointer is like "#/components/schemas/User" — strip leading "#/"
    const parts = pointer
        .slice(2)
        .split('/')
        .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current: unknown = doc;
    for (const part of parts) {
        if (typeof current !== 'object' || current === null) return false;
        current = (current as Record<string, unknown>)[part];
        if (current === undefined) return false;
    }
    return true;
}

function collectRefs(node: unknown, refs: Set<string>): void {
    if (typeof node === 'string') return;
    if (Array.isArray(node)) {
        for (const item of node) collectRefs(item, refs);
        return;
    }
    if (typeof node === 'object' && node !== null) {
        const rec = node as Record<string, unknown>;
        if (typeof rec['$ref'] === 'string') {
            refs.add(rec['$ref']);
        }
        for (const value of Object.values(rec)) {
            collectRefs(value, refs);
        }
    }
}

export const caOpenapi002: Rule = {
    id: 'CA-OPENAPI002',
    description:
        'OpenAPI spec contains a $ref pointer that resolves to a component or file that does not exist. Breaks code generators, validators, and API documentation tools.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        const spec = findSpecFile(ctx.repoRoot);
        if (!spec) return [];
        if (isExcluded(spec.relPath, ctx.config.exclude)) return [];

        let doc: unknown;
        try {
            doc = parseSpec(spec.absPath);
        } catch {
            return [];
        }

        const refs = new Set<string>();
        collectRefs(doc, refs);

        const specDir = path.dirname(spec.absPath);

        for (const ref of refs) {
            if (ref.startsWith('#/')) {
                // Internal JSON pointer
                if (!resolveJsonPointer(doc, ref)) {
                    findings.push({
                        ruleId: 'CA-OPENAPI002',
                        severity: 'error',
                        file: spec.relPath,
                        message: `$ref "${ref}" does not resolve to any component in the spec. Define the referenced component or fix the path.`,
                        fix: `Add the missing component under the "${ref.split('/').slice(1, 3).join('/')}" section, or correct the $ref path.`,
                    });
                }
            } else if (!ref.startsWith('http://') && !ref.startsWith('https://')) {
                // External file ref — strip any fragment
                const filePart = ref.split('#')[0];
                if (!filePart) continue;
                const resolved = path.resolve(specDir, filePart);
                if (!fs.existsSync(resolved)) {
                    findings.push({
                        ruleId: 'CA-OPENAPI002',
                        severity: 'error',
                        file: spec.relPath,
                        message: `$ref "${ref}" points to an external file that does not exist: ${filePart}`,
                        fix: `Create the file "${filePart}" relative to ${spec.relPath}, or correct the $ref path.`,
                    });
                }
            }
        }

        return findings;
    },
};
