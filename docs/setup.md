# codeanchor — Setup Guide

How to integrate `codeanchor` into pre-commit hooks, CI pipelines, and scheduled maintenance runs.

← [Back to README](../README.md)

---

## Pre-commit

Pre-commit runs `codeanchor scan --staged`, which only checks files that are staged for the current commit. This keeps it fast — it never re-scans your whole repo on every commit.

### Husky (Node projects)

```bash
npm install --save-dev husky
npx husky init
echo "npx codeanchor scan --staged" > .husky/pre-commit
```

If you already have a pre-commit file, append the command:

```bash
echo "npx codeanchor scan --staged" >> .husky/pre-commit
```

### Husky with lint-staged

If you use `lint-staged`, add codeanchor as a separate pre-commit step rather than inside lint-staged's per-file runner. codeanchor operates on the full staged set, not individual files.

```js
// .husky/pre-commit
npx lint-staged
npx codeanchor scan --staged
```

### pre-commit (Python ecosystem)

```yaml
# .pre-commit-config.yaml
repos:
    - repo: local
      hooks:
          - id: codeanchor
            name: codeanchor
            language: node
            entry: npx codeanchor scan --staged
            pass_filenames: false
```

`pass_filenames: false` is required — codeanchor reads staged diffs directly from git, not from file arguments.

---

## CI — PR scan

Run `codeanchor scan --base origin/main --head HEAD` on every pull request. This checks only the files changed in the PR against the base branch.

```yaml
# .github/workflows/codeanchor.yml
name: codeanchor
on:
    pull_request:
    push:
        branches: [main]
jobs:
    scan:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
              with:
                  fetch-depth: 0
            - uses: actions/setup-node@v4
              with:
                  node-version: '22'
            - run: npx codeanchor scan --base origin/main --head HEAD
```

`fetch-depth: 0` is required for the PR diff mode. Without it, `git diff` has no base to compare against.

### Exit codes in CI

| Code | Meaning                                              |
| ---- | ---------------------------------------------------- |
| 0    | No error-severity findings — pipeline continues      |
| 1    | One or more error-severity findings — pipeline fails |
| 2    | Config or usage error                                |

To fail on warnings too:

```yaml
- run: npx codeanchor scan --base origin/main --head HEAD --fail-on-warn
```

---

## CI — Full repo scan

For thorough checks that don't run well in staged/PR mode (e.g., CA-TSCONFIG001, CA-PUBLISH001, CA-ENV003):

```yaml
- run: npx codeanchor scan --repo
```

You can run both in the same workflow job:

```yaml
- run: npx codeanchor scan --base origin/main --head HEAD
- run: npx codeanchor scan --repo
```

---

## Scheduled maintenance report

History-mode rules (CA-TEST001, CA-TEST002, CA-OWN001, CA-TODO003) analyze git history rather than staged changes. They are slow on large repos and are not appropriate for pre-commit. Run them on a schedule instead.

```yaml
# .github/workflows/codeanchor-weekly.yml
name: codeanchor maintenance report
on:
    schedule:
        - cron: '0 9 * * 1' # every Monday at 09:00 UTC
    workflow_dispatch:
jobs:
    report:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
              with:
                  fetch-depth: 0
            - uses: actions/setup-node@v4
              with:
                  node-version: '22'
            - run: npx codeanchor scan --history --since 90d --markdown maintenance-report.md
            - uses: actions/upload-artifact@v4
              with:
                  name: maintenance-report
                  path: maintenance-report.md
```

---

## JSON output

All scan modes support `--json <file>` for machine-readable output:

```bash
codeanchor scan --repo --json report.json
```

The JSON schema:

```ts
{
    mode: 'staged' | 'repo' | 'pr' | 'history';
    timestamp: string;        // ISO 8601
    repoRoot: string;
    findings: {
        ruleId: string;
        severity: 'error' | 'warn' | 'info';
        file: string;
        line?: number;
        message: string;
        fix?: string;
        detail?: string;
    }[];
    errorCount: number;
    warnCount: number;
}
```

---

## Approvals (CA-CD001)

CA-CD001 flags when a leading comment wasn't updated alongside the code it describes. If the drift is intentional — e.g., the comment describes a contract that is still valid even though the implementation changed — approve it:

```bash
codeanchor approve src/api.ts 12
```

Approvals are stored in `.commentguard/approvals.json` and committed to the repo. They are invalidated automatically if the comment or the code directly beneath it changes.

To list all active approvals:

```bash
codeanchor rules   # shows rule summary; approval status shown inline
```
