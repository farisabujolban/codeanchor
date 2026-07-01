import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../types.js';
import type { Rule, RuleContext } from '../types.js';

const MIGRATIONS_DIR = 'supabase/migrations';

const SYSTEM_SCHEMAS = new Set([
    'auth',
    'storage',
    'realtime',
    'extensions',
    'pg_catalog',
    'information_schema',
    '_realtime',
    'pgbouncer',
    'vault',
]);

function stripSqlComments(s: string): string {
    return s
        .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

// Matches CREATE [UNLOGGED] TABLE [IF NOT EXISTS] [schema.]table
const CREATE_TABLE_RE = /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\s*\.\s*)?"?(\w+)"?/gi;

// Matches ALTER TABLE [schema.]table ENABLE ROW LEVEL SECURITY
const ENABLE_RLS_RE =
    /\bALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?(\w+)"?\s*\.\s*)?"?(\w+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\b/gi;

interface TableOrigin {
    schema: string | null;
    file: string;
}

function extractCreatedTables(content: string): Array<{ schema: string | null; name: string }> {
    const stripped = stripSqlComments(content);
    const results: Array<{ schema: string | null; name: string }> = [];
    CREATE_TABLE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CREATE_TABLE_RE.exec(stripped)) !== null) {
        results.push({ schema: m[1]?.toLowerCase() ?? null, name: m[2].toLowerCase() });
    }
    return results;
}

function extractRlsTables(content: string): Set<string> {
    const stripped = stripSqlComments(content);
    const names = new Set<string>();
    ENABLE_RLS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ENABLE_RLS_RE.exec(stripped)) !== null) {
        names.add(m[2].toLowerCase());
    }
    return names;
}

export const caSupa001: Rule = {
    id: 'CA-SUPA001',
    description: 'Supabase table created in migrations is missing ENABLE ROW LEVEL SECURITY.',
    defaultSeverity: 'error',
    applicableModes: ['repo', 'pr'],

    async run(ctx: RuleContext): Promise<Finding[]> {
        const migrationsDir = path.join(ctx.repoRoot, MIGRATIONS_DIR);
        if (!fs.existsSync(migrationsDir)) return [];

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
        } catch {
            return [];
        }

        const sqlFiles = entries
            .filter((e) => e.isFile() && e.name.endsWith('.sql'))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => path.join(MIGRATIONS_DIR, e.name));

        if (sqlFiles.length === 0) return [];

        const createdTables = new Map<string, TableOrigin>();
        const rlsEnabledTables = new Set<string>();

        for (const relPath of sqlFiles) {
            let content: string;
            try {
                content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8');
            } catch {
                continue;
            }

            for (const { schema, name } of extractCreatedTables(content)) {
                if (schema !== null && SYSTEM_SCHEMAS.has(schema)) continue;
                if (!createdTables.has(name)) {
                    createdTables.set(name, { schema, file: relPath });
                }
            }

            for (const name of extractRlsTables(content)) {
                rlsEnabledTables.add(name);
            }
        }

        const findings: Finding[] = [];

        for (const [tableName, { file }] of createdTables) {
            if (rlsEnabledTables.has(tableName)) continue;
            findings.push({
                ruleId: 'CA-SUPA001',
                severity: 'error',
                file,
                message: `Table "${tableName}" is missing "ENABLE ROW LEVEL SECURITY". Without RLS any authenticated user can read or modify all rows.`,
                fix: `Add "ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;" and define access policies.`,
            });
        }

        return findings;
    },
};
