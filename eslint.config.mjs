// @ts-check
import tseslint from 'typescript-eslint';
import codeanchorPlugin from '@farisabujolban/eslint-plugin-codeanchor';

export default tseslint.config(
    tseslint.configs.recommended,
    codeanchorPlugin.configs['recommended'],
    {
        // Rule implementations intentionally use sync I/O inside async run() functions —
        // this is a CLI tool where blocking the event loop is acceptable.
        files: ['src/rules/**/*.ts'],
        rules: { 'codeanchor/no-sync-in-async': 'off' },
    },
    {
        // Test files intentionally call JSON.parse() on controlled input — no need to guard
        files: ['tests/**/*.ts'],
        rules: { 'codeanchor/no-unguarded-json-parse': 'off' },
    },
    { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
);
