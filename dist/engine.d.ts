import type { Finding, ScanResult, ScanMode, FileDiff } from './types.js';
import type { CodeAnchorConfig } from './config.js';
export interface RuleContext {
    mode: ScanMode;
    repoRoot: string;
    config: CodeAnchorConfig;
    stagedDiffs?: FileDiff[];
    since?: string;
    ruleIds?: string[];
}
export interface Rule {
    id: string;
    description: string;
    defaultSeverity: 'error' | 'warn' | 'info';
    applicableModes: ScanMode[];
    run(ctx: RuleContext): Promise<Finding[]>;
}
export declare function runEngine(ctx: RuleContext): Promise<ScanResult>;
