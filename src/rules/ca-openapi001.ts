import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
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

// Paths to skip (internal/infra endpoints unlikely to be in spec)
const SKIP_PREFIXES = ['/health', '/_', '/metrics', '/readyz', '/livez', '/ping', '/favicon'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.nuxt', 'coverage', '.git']);
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

interface RouteDetector {
    name: string;
    fileSignature: RegExp;
    // Returns [method, path] pairs extracted from file content
    extract(content: string): Array<{ method: string; routePath: string; index: number }>;
}

const ROUTE_DETECTORS: RouteDetector[] = [
    {
        name: 'express/fastify/hono',
        fileSignature: /\b(?:express|fastify|hono|Router)\b/,
        extract(content) {
            const results: Array<{ method: string; routePath: string; index: number }> = [];
            // Match: .get('/path', ...) or .post('/path', ...) — literal paths only
            const re = /\.(get|post|put|patch|delete|options|head)\s*\(\s*['"]([^'"]+)['"]/gi;
            let m: RegExpExecArray | null;
            re.lastIndex = 0;
            while ((m = re.exec(content)) !== null) {
                const method = m[1].toLowerCase();
                const routePath = m[2];
                if (routePath.startsWith('/')) {
                    results.push({ method, routePath, index: m.index });
                }
            }
            return results;
        },
    },
    // Future: Flask, Gin, Spring, Rails — add one entry each
];

function findSpecFile(root: string): { absPath: string; relPath: string } | null {
    for (const loc of SPEC_LOCATIONS) {
        const absPath = path.join(root, loc);
        if (fs.existsSync(absPath)) return { absPath, relPath: loc };
    }
    return null;
}

// Normalize OpenAPI {param} to :param for uniform comparison
function openApiToExpress(p: string): string {
    return p.replace(/\{([^}]+)\}/g, ':$1');
}

// Normalize Express :param to {param} for OpenAPI output in messages
function expressToOpenApi(p: string): string {
    return p.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

function shouldSkip(routePath: string): boolean {
    return SKIP_PREFIXES.some((prefix) => routePath.startsWith(prefix));
}

function parseSpecRoutes(absPath: string): Map<string, Set<string>> {
    // Returns method → Set<normalizedPath> (Express-style :param)
    const routes = new Map<string, Set<string>>();
    try {
        const raw = fs.readFileSync(absPath, 'utf-8');
        const doc = (absPath.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw)) as {
            paths?: Record<string, Record<string, unknown>>;
        };
        if (!doc?.paths) return routes;
        for (const [rawPath, ops] of Object.entries(doc.paths)) {
            if (!ops || typeof ops !== 'object') continue;
            const normalized = openApiToExpress(rawPath);
            for (const method of Object.keys(ops)) {
                const m = method.toLowerCase();
                if (!HTTP_METHODS.has(m)) continue;
                if (!routes.has(m)) routes.set(m, new Set());
                routes.get(m)!.add(normalized);
            }
        }
    } catch {
        /* ignore */
    }
    return routes;
}

function walkSourceFiles(dir: string, results: string[]): void {
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop()!;
        try {
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    if (SKIP_DIRS.has(entry.name)) continue;
                    stack.push(path.join(current, entry.name));
                } else if (['.ts', '.js', '.tsx', '.jsx', '.mjs'].includes(path.extname(entry.name))) {
                    results.push(path.join(current, entry.name));
                }
            }
        } catch {
            /* ignore */
        }
    }
}

export const caOpenapi001: Rule = {
    id: 'CA-OPENAPI001',
    description:
        'Code route not documented in OpenAPI spec, or spec has an orphaned path with no matching code route. (JS/TS frameworks in v1 — add entries to ROUTE_DETECTORS for Flask, Gin, Spring, Rails etc.)',
    defaultSeverity: 'warn',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const specFile = findSpecFile(ctx.repoRoot);
        if (!specFile) return [];
        if (isExcluded(specFile.relPath, ctx.config.exclude)) return [];

        const specRoutes = parseSpecRoutes(specFile.absPath);
        if (specRoutes.size === 0) return [];

        const sourceFiles: string[] = [];
        walkSourceFiles(ctx.repoRoot, sourceFiles);

        // code routes: method → Set<normalizedPath> + source location map
        const codeRoutes = new Map<string, Set<string>>();
        const codeRouteSource = new Map<string, { file: string; line: number }>();

        for (const absPath of sourceFiles) {
            const relPath = path.relative(ctx.repoRoot, absPath);
            if (isExcluded(relPath, ctx.config.exclude)) continue;

            let content: string;
            try {
                content = fs.readFileSync(absPath, 'utf-8');
            } catch {
                continue;
            }

            for (const detector of ROUTE_DETECTORS) {
                if (!detector.fileSignature.test(content)) continue;
                for (const { method, routePath, index } of detector.extract(content)) {
                    if (shouldSkip(routePath)) continue;
                    const normalized = openApiToExpress(routePath);
                    if (!codeRoutes.has(method)) codeRoutes.set(method, new Set());
                    codeRoutes.get(method)!.add(normalized);
                    const key = `${method}:${normalized}`;
                    if (!codeRouteSource.has(key)) {
                        const lineNum = content.slice(0, index).split('\n').length;
                        codeRouteSource.set(key, { file: relPath, line: lineNum });
                    }
                }
            }
        }

        const findings: Finding[] = [];

        // (a) Code routes not in spec
        for (const [method, codePaths] of codeRoutes) {
            const specPaths = specRoutes.get(method) ?? new Set<string>();
            for (const codePath of codePaths) {
                if (!specPaths.has(codePath)) {
                    const src = codeRouteSource.get(`${method}:${codePath}`);
                    findings.push({
                        ruleId: 'CA-OPENAPI001',
                        severity: 'warn',
                        file: src?.file ?? specFile.relPath,
                        line: src?.line,
                        message: `Route ${method.toUpperCase()} ${codePath} exists in code but is not documented in ${specFile.relPath}.`,
                        fix: `Add path "${expressToOpenApi(codePath)}" with "${method}" operation to the OpenAPI spec.`,
                    });
                }
            }
        }

        // (b) Spec routes with no code route (orphaned)
        for (const [method, specPaths] of specRoutes) {
            const codePaths = codeRoutes.get(method) ?? new Set<string>();
            for (const specPath of specPaths) {
                if (shouldSkip(specPath)) continue;
                if (!codePaths.has(specPath)) {
                    findings.push({
                        ruleId: 'CA-OPENAPI001',
                        severity: 'warn',
                        file: specFile.relPath,
                        message: `OpenAPI spec documents ${method.toUpperCase()} ${expressToOpenApi(specPath)} but no matching route was found in code.`,
                        fix: `Remove the orphaned path from the spec, or implement the missing route.`,
                    });
                }
            }
        }

        return findings;
    },
};
