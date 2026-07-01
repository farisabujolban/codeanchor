import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caMigration003 } from '../../src/rules/ca-migration003.js';
import type { RuleContext } from '../../src/types.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ca-migration003-'));
}

function writeFile(dir: string, name: string, content = ''): void {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('CA-MIGRATION003', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports nothing when no migration directory exists', async () => {
        const findings = await caMigration003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('reports nothing when all migration timestamps are unique', async () => {
        writeFile(tmpDir, 'migrations/20240101_create_users.sql');
        writeFile(tmpDir, 'migrations/20240102_create_posts.sql');
        writeFile(tmpDir, 'migrations/20240103_add_email.sql');
        const findings = await caMigration003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags two migration files with the same timestamp', async () => {
        writeFile(tmpDir, 'migrations/20240101120000_create_users.sql');
        writeFile(tmpDir, 'migrations/20240101120000_add_email.sql');
        const findings = await caMigration003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('CA-MIGRATION003');
        expect(findings[0].message).toMatch(/20240101120000/);
    });

    it('reports one finding per duplicate timestamp group', async () => {
        writeFile(tmpDir, 'migrations/20240101_create_users.sql');
        writeFile(tmpDir, 'migrations/20240101_add_index.sql');
        writeFile(tmpDir, 'migrations/20240102_create_posts.sql');
        writeFile(tmpDir, 'migrations/20240102_add_slug.sql');
        const findings = await caMigration003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    it('also checks supabase/migrations directory', async () => {
        writeFile(tmpDir, 'supabase/migrations/20240101_create_users.sql');
        writeFile(tmpDir, 'supabase/migrations/20240101_add_rls.sql');
        const findings = await caMigration003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('also checks db/migrations directory', async () => {
        writeFile(tmpDir, 'db/migrations/20241201_init.sql');
        writeFile(tmpDir, 'db/migrations/20241201_seed.sql');
        const findings = await caMigration003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('treats files in different migration dirs independently', async () => {
        writeFile(tmpDir, 'migrations/20240101_foo.sql');
        writeFile(tmpDir, 'supabase/migrations/20240101_bar.sql');
        const findings = await caMigration003.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });
});
