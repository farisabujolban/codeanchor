import fs from 'node:fs';
import path from 'node:path';
import { isExcluded } from '../util/exclude.js';
function findDockerfiles(root) {
    const files = [];
    try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isFile() &&
                (entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.'))) {
                files.push(path.join(root, entry.name));
            }
        }
    }
    catch { /* ignore */ }
    return files;
}
// RUN npm run <script> / RUN pnpm run <script> / RUN yarn run <script>
// Also: RUN pnpm <script> / RUN yarn <script> (shorthand without "run")
const PKG_SCRIPT_RE = /\b(?:npm run|pnpm run|yarn run|pnpm|yarn)\s+([a-zA-Z0-9:_-]+)/g;
// CMD/ENTRYPOINT node dist/foo.js  (local relative path — no leading ./ required for CMD)
// We only check paths that look like relative file paths (contain a dot in filename or start with .)
const CMD_NODE_RE = /\bnode\s+((?:\.\/)?[\w./]+\.\w+)/;
const CMD_TS_NODE_RE = /\b(?:ts-node|tsx)\s+((?:\.\/)?[\w./]+\.\w+)/;
function extractScriptNamesFromRun(runLine) {
    const names = [];
    PKG_SCRIPT_RE.lastIndex = 0;
    let m;
    while ((m = PKG_SCRIPT_RE.exec(runLine)) !== null) {
        names.push(m[1]);
    }
    return names;
}
function extractNodePathFromExec(cmd) {
    let m = cmd.match(CMD_NODE_RE);
    if (m)
        return m[1];
    m = cmd.match(CMD_TS_NODE_RE);
    if (m)
        return m[1];
    return null;
}
// Parse CMD/ENTRYPOINT — handles both shell form and JSON array form
function parseCmdEntrypoint(trimmed) {
    // JSON array form: CMD ["node", "dist/index.js"]
    const jsonMatch = trimmed.match(/^(?:CMD|ENTRYPOINT)\s+(\[.*\])\s*$/i);
    if (jsonMatch) {
        try {
            const arr = JSON.parse(jsonMatch[1]);
            return arr.join(' ');
        }
        catch { /* fall through to shell form */ }
    }
    // Shell form: CMD node dist/index.js
    const shellMatch = trimmed.match(/^(?:CMD|ENTRYPOINT)\s+(.+)$/i);
    return shellMatch ? shellMatch[1] : '';
}
export const rdDocker002 = {
    id: 'RD-DOCKER002',
    description: 'Dockerfile RUN/CMD/ENTRYPOINT references a script or local file that does not exist.',
    defaultSeverity: 'warn',
    applicableModes: ['repo', 'pr'],
    async run(ctx) {
        const findings = [];
        // Load scripts from package.json once
        const pkgPath = path.join(ctx.repoRoot, 'package.json');
        let scripts = {};
        if (fs.existsSync(pkgPath) && !isExcluded('package.json', ctx.config.exclude)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                scripts = pkg.scripts ?? {};
            }
            catch { /* no scripts */ }
        }
        for (const dockerFile of findDockerfiles(ctx.repoRoot)) {
            const relPath = path.relative(ctx.repoRoot, dockerFile);
            if (isExcluded(relPath, ctx.config.exclude))
                continue;
            const content = fs.readFileSync(dockerFile, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                const lineNum = i + 1;
                // RUN lines — check npm/yarn/pnpm script references
                if (/^RUN\s+/i.test(trimmed)) {
                    const runBody = trimmed.replace(/^RUN\s+/i, '');
                    for (const scriptName of extractScriptNamesFromRun(runBody)) {
                        if (Object.keys(scripts).length > 0 && !(scriptName in scripts)) {
                            findings.push({
                                ruleId: 'RD-DOCKER002',
                                severity: 'warn',
                                file: relPath,
                                line: lineNum,
                                message: `RUN references npm script "${scriptName}" which is not in package.json.`,
                                detail: `Available: ${Object.keys(scripts).join(', ')}`,
                            });
                        }
                    }
                    continue;
                }
                // CMD / ENTRYPOINT — check node local file references
                if (/^(?:CMD|ENTRYPOINT)\s+/i.test(trimmed)) {
                    const cmdStr = parseCmdEntrypoint(trimmed);
                    const localFile = extractNodePathFromExec(cmdStr);
                    if (localFile) {
                        const resolved = path.resolve(ctx.repoRoot, localFile);
                        if (!fs.existsSync(resolved)) {
                            findings.push({
                                ruleId: 'RD-DOCKER002',
                                severity: 'warn',
                                file: relPath,
                                line: lineNum,
                                message: `CMD/ENTRYPOINT references "${localFile}" which does not exist.`,
                            });
                        }
                    }
                }
            }
        }
        return findings;
    },
};
