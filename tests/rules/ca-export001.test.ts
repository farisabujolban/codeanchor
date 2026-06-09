import { describe, it, expect } from 'vitest';
import { caExport001 } from '../../src/rules/ca-export001.js';
import type { RuleContext } from '../../src/types.js';

function makeCtx(repoRoot: string): RuleContext {
    return { mode: 'pr', repoRoot, config: { exclude: [], rules: {} } };
}

describe('CA-EXPORT001', () => {
    it('returns no findings for non-existent repo root', async () => {
        expect(await caExport001.run(makeCtx('/nonexistent'))).toHaveLength(0);
    });

    it('only applies to pr and staged modes', () => {
        expect(caExport001.applicableModes).toContain('pr');
        expect(caExport001.applicableModes).toContain('staged');
        expect(caExport001.applicableModes).not.toContain('repo');
    });
});
