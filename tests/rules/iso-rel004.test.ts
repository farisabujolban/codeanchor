import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { isoRel004 } from '../../src/rules/iso-rel004.js';
import type { RuleContext } from '../../src/types.js';

function makeTempGitRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-rel004-'));
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
    execSync('git commit -m "add"', { cwd: dir });
}

function makeCtx(dir: string): RuleContext {
    return { mode: 'repo', repoRoot: dir, config: { exclude: [], rules: {} } };
}

describe('ISO-REL004', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempGitRepo();
    });
    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- Java: broad catch without rethrow ---

    it('flags Java catch(Exception e) with no throw in body', async () => {
        writeAndCommit(
            tmpDir,
            'Service.java',
            `
public class Service {
  public void run() {
    try {
      doWork();
    } catch (Exception e) {
      logger.error("oops");
    }
  }
}
`,
        );
        const findings = await isoRel004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].ruleId).toBe('ISO-REL004');
        expect(findings[0].message).toContain('Exception');
    });

    it('flags Java catch(Throwable t) with no throw', async () => {
        writeAndCommit(
            tmpDir,
            'Service.java',
            `
try { work(); } catch (Throwable t) { log(); }
`,
        );
        const findings = await isoRel004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('Throwable');
    });

    it('flags Java catch(RuntimeException e) with no throw', async () => {
        writeAndCommit(tmpDir, 'Service.java', `try { work(); } catch (RuntimeException e) { recover(); }`);
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag Java catch(Exception e) that re-throws', async () => {
        writeAndCommit(
            tmpDir,
            'Service.java',
            `
try { work(); } catch (Exception e) { log(); throw new RuntimeException(e); }
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Java catch(Exception e) that re-throws bare throw', async () => {
        writeAndCommit(
            tmpDir,
            'Service.java',
            `
try { work(); } catch (Exception e) { log(); throw e; }
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Java specific exception catch (IOException)', async () => {
        writeAndCommit(
            tmpDir,
            'Service.java',
            `
try { work(); } catch (IOException e) { log(); }
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Java broad catch in a comment', async () => {
        writeAndCommit(
            tmpDir,
            'Service.java',
            `
// catch (Exception e) { swallow(); }
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('reports the line number of the catch keyword', async () => {
        writeAndCommit(
            tmpDir,
            'Service.java',
            `public class A {\n  public void run() {\n    try { work(); } catch (Exception e) { log(); }\n  }\n}`,
        );
        const findings = await isoRel004.run(makeCtx(tmpDir));
        expect(findings).toHaveLength(1);
        expect(findings[0].line).toBe(3);
    });

    // --- Python: broad except without re-raise ---

    it('flags Python bare except: with no raise', async () => {
        writeAndCommit(
            tmpDir,
            'service.py',
            `
try:
    do_work()
except:
    log_error()
`,
        );
        const findings = await isoRel004.run(makeCtx(tmpDir));
        expect(findings.some((f) => f.file === 'service.py')).toBe(true);
        expect(findings[0].ruleId).toBe('ISO-REL004');
    });

    it('flags Python except Exception: with no raise', async () => {
        writeAndCommit(
            tmpDir,
            'service.py',
            `
try:
    do_work()
except Exception:
    log_error()
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags Python except Exception as e: with no raise', async () => {
        writeAndCommit(
            tmpDir,
            'service.py',
            `
try:
    do_work()
except Exception as e:
    print(e)
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('flags Python except BaseException: with no raise', async () => {
        writeAndCommit(
            tmpDir,
            'service.py',
            `
try:
    do_work()
except BaseException:
    cleanup()
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(1);
    });

    it('does NOT flag Python except Exception: that re-raises', async () => {
        writeAndCommit(
            tmpDir,
            'service.py',
            `
try:
    do_work()
except Exception:
    log_error()
    raise
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python except Exception as e: with raise e', async () => {
        writeAndCommit(
            tmpDir,
            'service.py',
            `
try:
    do_work()
except Exception as e:
    log()
    raise e
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python specific exception catch (ValueError)', async () => {
        writeAndCommit(
            tmpDir,
            'service.py',
            `
try:
    do_work()
except ValueError:
    log_error()
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    it('does NOT flag Python broad except in # comment', async () => {
        writeAndCommit(tmpDir, 'service.py', `# except Exception:\n#   swallow()`);
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });

    // --- JS/TS is intentionally excluded ---

    it('does NOT flag JS/TS broad catch (no typed hierarchy)', async () => {
        writeAndCommit(
            tmpDir,
            'src/service.ts',
            `
try {
  doWork()
} catch (e) {
  console.error(e)
}
`,
        );
        expect(await isoRel004.run(makeCtx(tmpDir))).toHaveLength(0);
    });
});
