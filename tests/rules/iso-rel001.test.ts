import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoRel001 } from '../../src/rules/iso-rel001.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-rel001-'));
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    execSync('git config commit.gpgsign false', { cwd: dir });
    return dir;
}

function writeAndCommit(dir: string, relPath: string, content: string): void {
    const abs = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    execSync('git add -A', { cwd: dir });
    execSync(`git commit -m "add"`, { cwd: dir });
}

function makeCtx(dir: string): RuleContext {
    return {
        mode: 'repo',
        repoRoot: dir,
        config: { exclude: [], rules: {} },
    };
}

describe('ISO-REL001', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- JS/TS: empty catch ---

    it('flags empty catch block', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            `
try {
  doThing()
} catch (e) {
}
`,
        );
        const findings = await isoRel001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-REL001');
        expect(findings[0].file).toBe('src/a.ts');
    });

    it('does not flag comment-only catch block (comment is documented suppression)', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            `
try { doThing() } catch (e) {
  // intentional — file may not exist
}
`,
        );
        const findings = await isoRel001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(0);
    });

    it('flags single-line empty catch', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `try { x() } catch (e) {}`);
        const findings = await isoRel001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('flags catch without binding (catch {})', async () => {
        writeAndCommit(tmpDir, 'src/a.ts', `try { x() } catch {}`);
        const findings = await isoRel001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('does not flag catch with console.error', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            `
try {
  doThing()
} catch (e) {
  console.error(e)
}
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag catch with throw', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            `
try {
  doThing()
} catch (e) {
  throw e
}
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag catch with return', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            `
function f() {
  try { doThing() } catch (e) { return null }
}
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag catch containing a nested try', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            `
try {
  doThing()
} catch (e) {
  try { recover() } catch {}
}
`,
        );
        // outer catch has a nested try — not empty
        const findings = await isoRel001.run(makeCtx(tmpDir));
        // outer catch should not be flagged; inner catch {} may be flagged
        const outerFindings = findings.filter((f) => f.line === 3);
        expect(outerFindings).toHaveLength(0);
    });

    it('reports correct line number', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            `
const x = 1
try {
  doThing()
} catch (e) {
}
const y = 2
`,
        );
        const findings = await isoRel001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].line).toBe(5);
    });

    it('flags multiple empty catches in one file', async () => {
        writeAndCommit(
            tmpDir,
            'src/a.ts',
            `
try { a() } catch (e) {}
try { b() } catch (e) { console.error(e) }
try { c() } catch (e) {}
`,
        );
        const findings = await isoRel001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(2);
    });

    // --- Java ---

    it('flags empty Java catch block', async () => {
        writeAndCommit(
            tmpDir,
            'Foo.java',
            `
public class Foo {
  void run() {
    try {
      doThing();
    } catch (Exception e) {
    }
  }
}
`,
        );
        const findings = await isoRel001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
    });

    it('does not flag Java catch with code', async () => {
        writeAndCommit(
            tmpDir,
            'Foo.java',
            `
public class Foo {
  void run() {
    try {
      doThing();
    } catch (Exception e) {
      logger.warn("error", e);
    }
  }
}
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- Python ---

    it('flags except: pass', async () => {
        writeAndCommit(
            tmpDir,
            'utils.py',
            `
try:
    do_thing()
except:
    pass
`,
        );
        const findings = await isoRel001.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].file).toBe('utils.py');
    });

    it('flags except Exception: pass', async () => {
        writeAndCommit(
            tmpDir,
            'utils.py',
            `
try:
    do_thing()
except Exception:
    pass
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags except ValueError as e: pass', async () => {
        writeAndCommit(
            tmpDir,
            'utils.py',
            `
try:
    do_thing()
except ValueError as e:
    pass
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does not flag except with logging call', async () => {
        writeAndCommit(
            tmpDir,
            'utils.py',
            `
try:
    do_thing()
except Exception as e:
    logging.error(e)
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag except with raise', async () => {
        writeAndCommit(
            tmpDir,
            'utils.py',
            `
try:
    do_thing()
except Exception:
    raise
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does not flag except block with real code before pass', async () => {
        writeAndCommit(
            tmpDir,
            'utils.py',
            `
try:
    do_thing()
except Exception as e:
    logged = False
    pass
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('ignores non-source files', async () => {
        writeAndCommit(
            tmpDir,
            'README.md',
            `
\`\`\`
try { x() } catch (e) {}
\`\`\`
`,
        );
        expect(await isoRel001.run(makeCtx(tmpDir))).toHaveLength(0);
    });
});
