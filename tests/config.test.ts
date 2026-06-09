import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

let tmpDir: string;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-config-'));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
    it('returns defaults when no config file exists', () => {
        const config = loadConfig(tmpDir);
        expect(config.exclude).toEqual([]);
        expect(typeof config.rules).toBe('object');
    });

    it('merges user exclude with defaults', () => {
        fs.writeFileSync(
            path.join(tmpDir, 'codeanchor.config.json'),
            JSON.stringify({
                exclude: ['dist/**', 'node_modules/**'],
            }),
        );
        const config = loadConfig(tmpDir);
        expect(config.exclude).toContain('dist/**');
        expect(config.exclude).toContain('node_modules/**');
    });

    it('merges user rules with defaults', () => {
        fs.writeFileSync(
            path.join(tmpDir, 'codeanchor.config.json'),
            JSON.stringify({
                rules: { 'CA-CI001': false },
            }),
        );
        const config = loadConfig(tmpDir);
        expect(config.rules['CA-CI001']).toBe(false);
    });

    it('returns defaults on invalid JSON', () => {
        fs.writeFileSync(path.join(tmpDir, 'codeanchor.config.json'), 'not json');
        const config = loadConfig(tmpDir);
        expect(config.exclude).toEqual([]);
    });
});
