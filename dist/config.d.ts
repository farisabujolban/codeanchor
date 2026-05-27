export interface RuleConfig {
    severity?: 'error' | 'warn' | 'info';
    maxOwnershipDistance?: number;
}
export interface CodeAnchorConfig {
    exclude: string[];
    rules: Record<string, RuleConfig | false | undefined>;
}
export declare function loadConfig(cwd?: string): CodeAnchorConfig;
