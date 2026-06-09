import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';
import { isExcluded } from '../util/exclude.js';

function walkMd(dir: string, results: string[]): void {
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (!fs.existsSync(current)) continue;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) stack.push(full);
            else if (entry.name.endsWith('.md')) results.push(full);
        }
    }
}

function findDocFiles(root: string): string[] {
    const files: string[] = [];
    const readme = path.join(root, 'README.md');
    if (fs.existsSync(readme)) files.push(readme);
    walkMd(path.join(root, 'docs'), files);
    return files;
}

interface ScriptRef {
    scriptName: string;
    line: number;
}

function extractScriptRefs(content: string): ScriptRef[] {
    const refs: ScriptRef[] = [];
    const lines = content.split('\n');
    // Match `npm run X`, `yarn X`, `pnpm X` in backtick-enclosed inline code
    const pattern = /`(?:npm run |pnpm run |yarn run |pnpm |yarn )([a-zA-Z0-9:_-]+)`/g;
    for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(lines[i])) !== null) {
            refs.push({ scriptName: m[1], line: i + 1 });
        }
    }
    return refs;
}

export const caDocs001: Rule = {
    id: 'CA-DOCS001',
    description: 'README or docs reference an npm script that is missing from package.json.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const pkgPath = path.join(ctx.repoRoot, 'package.json');
        if (!fs.existsSync(pkgPath)) return [];
        let scripts: Record<string, string> = {};
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
            scripts = pkg.scripts ?? {};
        } catch {
            return [];
        }

        const findings: Finding[] = [];
        for (const docFile of findDocFiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, docFile);
            if (isExcluded(relPath, ctx.config.exclude)) continue;
            const content = fs.readFileSync(docFile, 'utf-8');
            for (const { scriptName, line } of extractScriptRefs(content)) {
                if (!(scriptName in scripts)) {
                    findings.push({
                        ruleId: 'CA-DOCS001',
                        severity: 'error',
                        file: relPath,
                        line,
                        message: `Script "${scriptName}" referenced in docs but not found in package.json.`,
                        detail: `Available: ${Object.keys(scripts).join(', ')}`,
                    });
                }
            }
        }
        return findings;
    },
};
