import fs from 'node:fs';
import path from 'node:path';
import { isExcluded } from '../util/exclude.js';
// Match node/ts-node/tsx followed by a local path, or bare local paths
const localPathPattern = /(?:(?:node|ts-node|tsx)\s+)(\.\.?\/\S+)|(\.\.?\/\S+)/g;
function extractLocalPaths(scriptValue) {
    const paths = [];
    localPathPattern.lastIndex = 0;
    let m;
    while ((m = localPathPattern.exec(scriptValue)) !== null) {
        paths.push(m[1] ?? m[2]);
    }
    return paths;
}
export const rdPkg001 = {
    id: 'RD-PKG001',
    description: 'package.json script references a local file that does not exist.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],
    async run(ctx) {
        const pkgPath = path.join(ctx.repoRoot, 'package.json');
        if (!fs.existsSync(pkgPath))
            return [];
        if (isExcluded('package.json', ctx.config.exclude))
            return [];
        let pkg;
        let pkgContent;
        try {
            pkgContent = fs.readFileSync(pkgPath, 'utf-8');
            pkg = JSON.parse(pkgContent);
        }
        catch {
            return [];
        }
        if (!pkg.scripts)
            return [];
        const findings = [];
        const pkgLines = pkgContent.split('\n');
        for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
            for (const localPath of extractLocalPaths(scriptValue)) {
                const resolved = path.resolve(ctx.repoRoot, localPath);
                if (!fs.existsSync(resolved)) {
                    const lineIdx = pkgLines.findIndex(l => l.includes(`"${scriptName}"`) && l.includes(localPath));
                    findings.push({
                        ruleId: 'RD-PKG001',
                        severity: 'error',
                        file: 'package.json',
                        line: lineIdx >= 0 ? lineIdx + 1 : undefined,
                        message: `Script "${scriptName}" references "${localPath}" which does not exist.`,
                    });
                }
            }
        }
        return findings;
    },
};
