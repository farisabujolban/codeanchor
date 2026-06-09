import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caI18n001 } from '../../src/rules/ca-i18n001.js';
import type { RuleContext } from '../../src/types.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-i18n001-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string): void {
    const full = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}
function makeCtx(): RuleContext {
    return { mode: 'repo', repoRoot: tmpDir, config: { exclude: [], rules: {} } };
}

describe('CA-I18N001', () => {
    it('returns no findings when no locale files exist', async () => {
        writeFile('package.json', '{}');
        writeFile('src/app.ts', `t('greeting')`);
        expect(await caI18n001.run(makeCtx())).toHaveLength(0);
    });

    it('flags a translation key used in code but missing from locale', async () => {
        writeFile('package.json', '{}');
        writeFile('locales/en.json', JSON.stringify({ greeting: 'Hello' }));
        writeFile('src/app.ts', `t('missing_key')`);
        const findings = await caI18n001.run(makeCtx());
        expect(findings.some((f) => f.message.includes('missing_key'))).toBe(true);
    });

    it('does not flag a key that exists in locale', async () => {
        writeFile('package.json', '{}');
        writeFile('locales/en.json', JSON.stringify({ greeting: 'Hello' }));
        writeFile('src/app.ts', `t('greeting')`);
        expect(await caI18n001.run(makeCtx())).toHaveLength(0);
    });
});
