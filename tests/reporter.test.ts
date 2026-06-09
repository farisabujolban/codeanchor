import { describe, it, expect, vi, afterEach } from 'vitest';
import { printResult, renderMarkdown } from '../src/reporter.js';
import type { ScanResult } from '../src/types.js';

function makeResult(overrides: Partial<ScanResult> = {}): ScanResult {
    return {
        mode: 'repo',
        timestamp: '2024-01-01T00:00:00.000Z',
        findings: [],
        errorCount: 0,
        warnCount: 0,
        ...overrides,
    };
}

describe('printResult', () => {
    afterEach(() => vi.restoreAllMocks());

    it('prints "No issues found." when findings is empty', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        printResult(makeResult());
        expect(spy.mock.calls.some((c) => String(c[0]).includes('No issues found.'))).toBe(true);
    });

    it('prints ruleId, severity, and message for each finding', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        printResult(
            makeResult({
                findings: [{ ruleId: 'ISO-REL001', severity: 'warn', file: 'src/foo.ts', message: 'empty catch' }],
                warnCount: 1,
            }),
        );
        const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(output).toContain('ISO-REL001');
        expect(output).toContain('empty catch');
    });

    it('prints error count summary', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        printResult(
            makeResult({
                findings: [{ ruleId: 'X', severity: 'error', file: 'f', message: 'm' }],
                errorCount: 1,
            }),
        );
        const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(output).toContain('1 error');
    });
});

describe('renderMarkdown', () => {
    it('includes mode and date header', () => {
        const md = renderMarkdown(makeResult());
        expect(md).toContain('**Mode:** repo');
        expect(md).toContain('2024-01-01');
    });

    it('includes "No issues found." for empty findings', () => {
        expect(renderMarkdown(makeResult())).toContain('No issues found.');
    });

    it('lists errors in Errors section', () => {
        const md = renderMarkdown(
            makeResult({
                findings: [{ ruleId: 'ISO-SEC001', severity: 'error', file: 'src/x.ts', message: 'bad thing' }],
                errorCount: 1,
            }),
        );
        expect(md).toContain('## Errors');
        expect(md).toContain('ISO-SEC001');
        expect(md).toContain('bad thing');
    });

    it('lists warnings in Warnings section', () => {
        const md = renderMarkdown(
            makeResult({
                findings: [{ ruleId: 'ISO-REL001', severity: 'warn', file: 'src/x.ts', message: 'warn msg' }],
                warnCount: 1,
            }),
        );
        expect(md).toContain('## Warnings');
        expect(md).toContain('warn msg');
    });
});
