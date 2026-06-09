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
    { ignores: ['dist/**', 'node_modules/**'] },
);
