import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caSupa001 } from '../../src/rules/ca-supa001.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-supa001-'));
}

function writeMigration(dir: string, filename: string, sql: string): void {
    const migrationsDir = path.join(dir, 'supabase', 'migrations');
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, filename), sql, 'utf-8');
}

function makeMigrationsDir(dir: string): void {
    fs.mkdirSync(path.join(dir, 'supabase', 'migrations'), { recursive: true });
}

function makeCtx(tmpDir: string): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-SUPA001', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns no findings when supabase/migrations does not exist', async () => {
        expect(await caSupa001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('returns no findings when migrations directory is empty', async () => {
        makeMigrationsDir(tmpDir);
        expect(await caSupa001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('returns no findings when table has RLS enabled in the same migration', async () => {
        writeMigration(
            tmpDir,
            '001_create_profiles.sql',
            `
CREATE TABLE profiles (
  id uuid primary key
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
`,
        );
        expect(await caSupa001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('flags a table missing RLS', async () => {
        writeMigration(
            tmpDir,
            '001_create_profiles.sql',
            `
CREATE TABLE profiles (
  id uuid primary key
);
`,
        );
        const findings = await caSupa001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-SUPA001');
        expect(findings[0].message).toContain('"profiles"');
        expect(findings[0].file).toBe('supabase/migrations/001_create_profiles.sql');
    });

    it('finds RLS in a later migration file', async () => {
        writeMigration(tmpDir, '001_create_profiles.sql', `CREATE TABLE profiles (id uuid);`);
        writeMigration(tmpDir, '002_enable_rls.sql', `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;`);
        expect(await caSupa001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('flags multiple tables missing RLS', async () => {
        writeMigration(
            tmpDir,
            '001_create_tables.sql',
            `
CREATE TABLE profiles (id uuid);
CREATE TABLE posts (id uuid);
`,
        );
        const findings = await caSupa001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('handles CREATE TABLE IF NOT EXISTS', async () => {
        writeMigration(
            tmpDir,
            '001_create.sql',
            `
CREATE TABLE IF NOT EXISTS profiles (id uuid primary key);
`,
        );
        const findings = await caSupa001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('"profiles"');
    });

    it('handles schema-qualified CREATE TABLE and skips system schemas', async () => {
        writeMigration(
            tmpDir,
            '001_create.sql',
            `
CREATE TABLE auth.users (id uuid);
CREATE TABLE public.profiles (id uuid);
`,
        );
        const findings = await caSupa001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('"profiles"');
    });

    it('handles schema-qualified ALTER TABLE for RLS', async () => {
        writeMigration(
            tmpDir,
            '001_create.sql',
            `
CREATE TABLE profiles (id uuid);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
`,
        );
        expect(await caSupa001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('ignores SQL comment lines', async () => {
        writeMigration(
            tmpDir,
            '001_create.sql',
            `
-- CREATE TABLE fake_table (id uuid);
CREATE TABLE profiles (id uuid);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
`,
        );
        expect(await caSupa001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('handles ALTER TABLE ONLY syntax', async () => {
        writeMigration(
            tmpDir,
            '001_create.sql',
            `
CREATE TABLE profiles (id uuid);
ALTER TABLE ONLY profiles ENABLE ROW LEVEL SECURITY;
`,
        );
        expect(await caSupa001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('handles CREATE UNLOGGED TABLE', async () => {
        writeMigration(
            tmpDir,
            '001_create.sql',
            `
CREATE UNLOGGED TABLE sessions (id uuid);
`,
        );
        const findings = await caSupa001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('"sessions"');
    });
});
