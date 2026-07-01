import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Rule, RuleContext } from '../types.js';

const CREDENTIAL_KEY_RE =
    /\b(password|passwd|secret|api[_-]?key|apikey|token|auth[_-]?token|private[_-]?key|access[_-]?key|client[_-]?secret|db[_-]?pass(word)?|database[_-]?pass(word)?|jwt[_-]?secret|encryption[_-]?key|signing[_-]?key)\b/i;

const PLACEHOLDER_WORDS_RE =
    /your|here|example|placeholder|change|replace|xxx|todo|sample|fake|dummy|insert|fill|add|put/i;

function isPlaceholder(value: string): boolean {
    if (value.length === 0) return true;
    if (value === 'true' || value === 'false' || value === '0' || value === '1') return true;
    if (value.startsWith('<') || value.startsWith('[') || value.startsWith('$')) return true;
    if (PLACEHOLDER_WORDS_RE.test(value)) return true;
    return false;
}

function parseEnvFile(content: string): Array<{ key: string; value: string; line: number }> {
    const entries: Array<{ key: string; value: string; line: number }> = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        entries.push({ key, value, line: i + 1 });
    }
    return entries;
}

export const caEnv004: Rule = {
    id: 'CA-ENV004',
    description:
        '.env.example contains a credential-named key with a value that looks real rather than a placeholder. Committing real secrets to .env.example exposes them in version control.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const findings: Finding[] = [];

        for (const filename of ['.env.example', '.env.sample']) {
            const absPath = path.join(ctx.repoRoot, filename);
            if (!fs.existsSync(absPath)) continue;

            let content: string;
            try {
                content = fs.readFileSync(absPath, 'utf-8');
            } catch {
                continue;
            }

            for (const { key, value, line } of parseEnvFile(content)) {
                if (!CREDENTIAL_KEY_RE.test(key)) continue;
                if (value.length < 8) continue;
                if (isPlaceholder(value)) continue;

                findings.push({
                    ruleId: 'CA-ENV004',
                    severity: 'error',
                    file: filename,
                    line,
                    message: `"${key}" in ${filename} appears to contain a real credential value rather than a placeholder. Replace with a descriptive placeholder like "your-${key.toLowerCase()}-here".`,
                    fix: `${key}=your-${key.toLowerCase()}-here`,
                });
            }
        }

        return findings;
    },
};
