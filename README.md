# codeanchor

[![npm version](https://img.shields.io/npm/v/@farisabujolban/codeanchor)](https://www.npmjs.com/package/@farisabujolban/codeanchor)
[![CI](https://img.shields.io/github/actions/workflow/status/farisabujolban/codeanchor/ci.yml?branch=main&label=CI)](https://github.com/farisabujolban/codeanchor/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@farisabujolban/codeanchor)](LICENSE)

`codeanchor` catches the class of bugs that ESLint, Prettier, and type checkers cannot: broken references between your repo's moving parts. Docs that reference deleted scripts. CI workflows that call scripts that don't exist. Dockerfiles that COPY paths that were renamed. Feature flags not declared in config. i18n keys used in code but missing from locale files. It runs alongside your existing tools, not instead of them.

---

## Table of contents

- [The problem it solves](#the-problem-it-solves)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Rules](#rules)
- [ISO quality checks](#iso-quality-checks)
- [Pre-commit setup](#pre-commit-setup)
- [GitHub Actions setup](#github-actions-setup)
- [Config reference](#config-reference)
- [Approvals (CA-CD001)](#approvals-ca-cd001)
- [Exit codes](#exit-codes)
- [Companion ESLint plugin](#companion-eslint-plugin)
- [Contributing](#contributing)

---

## The problem it solves

You rename `scripts/build.js` to `scripts/bundle.js`. Your README still says `npm run build`, your CI workflow still calls it, and your Dockerfile still tries to COPY the old path. Nothing fails until you deploy or onboard a new engineer. `codeanchor` catches this before the commit lands.

---

## Installation

**As a project dev dependency** (recommended — ensures CI and all teammates use the same version):

```bash
npm install --save-dev @farisabujolban/codeanchor
```

`--save-dev` keeps `codeanchor` out of your production bundle and pins the version in `package.json` so your whole team runs the same checks.

**Globally** (for personal use across projects):

```bash
npm install -g @farisabujolban/codeanchor
```

**Without installing** (zero-setup trial):

```bash
npx codeanchor scan --repo
```

---

## Quick start

**Pre-commit — staged files only:**

```bash
codeanchor scan --staged
```

**Full repo scan:**

```bash
codeanchor scan --repo
```

**PR diff (in CI):**

```bash
codeanchor scan --base origin/main --head HEAD
```

**History report (run weekly, never blocks commits):**

```bash
codeanchor scan --history --since 90d
```

**JSON output:**

```bash
codeanchor scan --repo --json report.json
```

**Markdown report:**

```bash
codeanchor scan --history --since 90d --markdown maintenance-report.md
```

**List all rules:**

```bash
codeanchor rules
```

---

## Rules

Full rule reference with per-rule details: [docs/rules.md](docs/rules.md).

### Git / Code integrity

| ID              | Description                                                                    | Mode             | Default |
| --------------- | ------------------------------------------------------------------------------ | ---------------- | ------- |
| CA-CD001        | Code changed but leading comment was not updated                               | `staged`         | error   |
| CA-CHANGELOG001 | `package.json` version has no matching entry in `CHANGELOG.md`                 | `repo`, `staged` | warn    |
| CA-EXPORT001    | Symbol silently removed from a public module index — potential breaking change | `pr`, `staged`   | warn    |

### CI/CD

| ID       | Description                                                            | Mode         | Default |
| -------- | ---------------------------------------------------------------------- | ------------ | ------- |
| CA-CI001 | GitHub Actions workflow references a missing npm script                | `repo`, `pr` | error   |
| CA-CI002 | `setup-node` version doesn't match `.nvmrc` or `engines.node`          | `repo`, `pr` | warn    |
| CA-CI003 | GitHub Actions workflow references a local path that doesn't exist     | `repo`, `pr` | error   |
| CA-CI004 | Workflow uses unpinned action ref instead of full commit SHA           | `repo`, `pr` | warn    |
| CA-CI005 | Workflow `needs:` references a job that doesn't exist in the same file | `repo`, `pr` | error   |

### Docker

| ID            | Description                                                                         | Mode         | Default |
| ------------- | ----------------------------------------------------------------------------------- | ------------ | ------- |
| CA-DOCKER001  | Dockerfile `COPY`/`ADD` references a source path that doesn't exist                 | `repo`, `pr` | warn    |
| CA-DOCKER002  | Dockerfile `RUN`/`CMD`/`ENTRYPOINT` references a missing script or file             | `repo`, `pr` | warn    |
| CA-DOCKER003  | Dockerfile `FROM` version doesn't match `.nvmrc`/`engines.node`/`go.mod`            | `repo`, `pr` | warn    |
| CA-DOCKER004  | Dockerfile sets a credential-named `ENV`/`ARG` with a hardcoded default             | `repo`, `pr` | error   |
| CA-DOCKER005  | Dockerfile exists but `.dockerignore` is missing or doesn't exclude sensitive paths | `repo`, `pr` | error   |
| CA-COMPOSE001 | Docker Compose `depends_on`/`volumes`/`networks` reference an undeclared name       | `repo`, `pr` | error   |
| CA-COMPOSE002 | Docker Compose `env_file` or `build.dockerfile` references a missing path           | `repo`, `pr` | error   |

### Package / npm

| ID            | Description                                                                                    | Mode           | Default |
| ------------- | ---------------------------------------------------------------------------------------------- | -------------- | ------- |
| CA-PKG001     | `package.json` script references a local file that doesn't exist                               | `repo`, `pr`   | error   |
| CA-PKG002     | `package.json` entrypoint field references a missing path                                      | `repo`, `pr`   | error   |
| CA-PKG003     | `exports` field references a `dist` path not covered by the `files` field                      | `repo`, `pr`   | error   |
| CA-PKG004     | `package.json` script calls `npm run` with a script name not defined in `scripts`              | `repo`, `pr`   | error   |
| CA-LOCK001    | Dependency fields changed but no lockfile was updated                                          | `staged`, `pr` | error   |
| CA-DEPS001    | Production dep only imported in test files — should be `devDependencies`                       | `repo`         | warn    |
| CA-PUBLISH001 | `npm publish` may ship source maps, env files, or all repo files due to missing publish config | `repo`, `pr`   | error   |
| CA-MONO001    | Same dep declared at different versions across monorepo workspace packages                     | `repo`, `pr`   | warn    |

### Documentation

| ID         | Description                                                                 | Mode         | Default |
| ---------- | --------------------------------------------------------------------------- | ------------ | ------- |
| CA-DOCS001 | README/docs reference a missing npm script                                  | `repo`, `pr` | error   |
| CA-DOCS002 | README/docs have a broken relative Markdown link                            | `repo`, `pr` | error   |
| CA-DOCS004 | README/docs reference a hardcoded version that doesn't match `package.json` | `repo`, `pr` | warn    |

### Environment & secrets

| ID        | Description                                                                         | Mode                   | Default |
| --------- | ----------------------------------------------------------------------------------- | ---------------------- | ------- |
| CA-ENV001 | `.env.example` is missing keys that exist in other tracked env files                | `repo`, `pr`           | warn    |
| CA-ENV002 | `.env` file tracked by git — may expose secrets                                     | `repo`, `pr`, `staged` | error   |
| CA-ENV003 | `.env` file on disk not covered by `.gitignore` — one `git add .` away from leaking | `repo`, `pr`           | error   |

### Config drift

| ID             | Description                                                        | Mode         | Default |
| -------------- | ------------------------------------------------------------------ | ------------ | ------- |
| CA-CONFIG001   | A config key present in one env config file is absent from another | `repo`, `pr` | warn    |
| CA-TSCONFIG001 | `tsconfig.json` references a path that doesn't exist               | `repo`, `pr` | error   |
| CA-TSCONFIG002 | `tsconfig.json` doesn't enable `strict` mode                       | `repo`       | warn    |

### Infrastructure

| ID              | Description                                                                     | Mode                   | Default |
| --------------- | ------------------------------------------------------------------------------- | ---------------------- | ------- |
| CA-MAKEFILE001  | Makefile calls `$(MAKE)` with a target not defined in the same file             | `repo`, `pr`           | error   |
| CA-MIGRATION001 | Migration file has no rollback (down) migration                                 | `repo`                 | warn    |
| CA-OPENAPI001   | Code route not in OpenAPI spec, or spec has an orphaned path with no code route | `repo`, `pr`, `staged` | warn    |
| CA-ROUTE001     | URL param name doesn't match the `req.params` key accessed in the handler       | `repo`, `pr`, `staged` | error   |

### Code quality

| ID         | Description                                                                   | Mode                   | Default |
| ---------- | ----------------------------------------------------------------------------- | ---------------------- | ------- |
| CA-FEAT001 | Feature flag key referenced in code not declared in the flags config file     | `repo`, `pr`, `staged` | warn    |
| CA-I18N001 | i18n key used in code not present in any locale file                          | `repo`, `pr`, `staged` | error   |
| CA-PLAN001 | Plan file missing required AI model or intelligence level in YAML frontmatter | `repo`, `staged`, `pr` | warn    |

### History & ownership

| ID         | Description                                                               | Mode                | Default |
| ---------- | ------------------------------------------------------------------------- | ------------------- | ------- |
| CA-TEST001 | Frequently changed file has no associated test                            | `history`           | warn    |
| CA-TEST002 | Source changed much more often than its test — test may be stale          | `history`           | warn    |
| CA-OWN001  | Frequently changed file has no CODEOWNERS entry                           | `history`           | warn    |
| CA-OWN002  | CODEOWNERS pattern matches no tracked files — likely stale after a rename | `repo`, `pr`        | warn    |
| CA-TODO003 | TODO/FIXME/HACK older than 90 days with no issue link                     | `history`, `staged` | warn    |

---

## ISO quality checks

`codeanchor` includes a second rule family — `ISO-*` — that checks language-level code patterns against [ISO 5055](https://www.it-cisq.org/cisq-files/pdf/CISQ-OMG-Automated-Quality-Characteristic-Measures.pdf) and [ISO/IEC 25010](https://www.iso.org/standard/35733.html) quality characteristics (Maintainability, Reliability, Security, Portability).

These rules differ from `CA-*` rules: they inspect source files for code patterns rather than checking cross-file references. They are enabled by default at mostly `warn` severity so they never silently block a build without you knowing.

Full details and language support for each rule: [docs/rules.md — ISO quality checks](docs/rules.md#iso-quality-checks).

### ISO-MAI — Maintainability

| ID         | Description                                                                                     | Mode         | Default |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------ | ------- |
| ISO-MAI001 | Circular import between modules                                                                 | `repo`, `pr` | error   |
| ISO-MAI002 | File exports too many public symbols — low cohesion (configurable threshold)                    | `repo`, `pr` | warn    |
| ISO-MAI003 | Module has high afferent coupling — too many internal files import it                           | `repo`, `pr` | info    |
| ISO-MAI004 | Source file has no test counterpart (audits all source files; CA-TEST001 audits only hot files) | `repo`, `pr` | info    |

### ISO-REL — Reliability

| ID         | Description                                                              | Mode                   | Default |
| ---------- | ------------------------------------------------------------------------ | ---------------------- | ------- |
| ISO-REL001 | Empty catch block silently swallows exceptions (CWE-390)                 | `repo`, `pr`, `staged` | warn    |
| ISO-REL002 | Direct recursive function call — unbounded stack risk                    | `repo`, `pr`, `staged` | warn    |
| ISO-REL003 | Floating-point exact equality comparison (CWE-1339)                      | `repo`, `pr`, `staged` | warn    |
| ISO-REL004 | Catch block catches generic exception type without re-throwing (CWE-396) | `repo`, `pr`, `staged` | warn    |

### ISO-SEC — Security

| ID         | Description                                                               | Mode                   | Default |
| ---------- | ------------------------------------------------------------------------- | ---------------------- | ------- |
| ISO-SEC001 | Broken/weak cryptographic algorithm used — MD5, SHA-1, DES, RC4 (CWE-327) | `repo`, `pr`, `staged` | warn    |
| ISO-SEC002 | ReDoS-vulnerable regex pattern — nested quantifiers (CWE-1333)            | `repo`, `pr`, `staged` | warn    |

### ISO-POR — Portability

| ID         | Description                                              | Mode                   | Default |
| ---------- | -------------------------------------------------------- | ---------------------- | ------- |
| ISO-POR001 | Hardcoded Windows path separator `\` in a string literal | `repo`, `pr`, `staged` | warn    |

### Opting out

ISO rules run by default. To disable individual rules:

```json
{
    "rules": {
        "ISO-MAI002": false,
        "ISO-REL002": false
    }
}
```

To disable the entire ISO family:

```json
{
    "rules": {
        "ISO-MAI001": false,
        "ISO-MAI002": false,
        "ISO-MAI003": false,
        "ISO-MAI004": false,
        "ISO-REL001": false,
        "ISO-REL002": false,
        "ISO-REL003": false,
        "ISO-REL004": false,
        "ISO-SEC001": false,
        "ISO-SEC002": false,
        "ISO-POR001": false
    }
}
```

To promote a rule to `error` so it blocks CI:

```json
{
    "rules": {
        "ISO-SEC001": { "severity": "error" },
        "ISO-SEC002": { "severity": "error" }
    }
}
```

---

## Pre-commit setup

### Husky

```bash
npm install --save-dev husky
npx husky init
echo "npx codeanchor scan --staged" > .husky/pre-commit
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

Full setup options including CI integration: [docs/setup.md](docs/setup.md).

---

## GitHub Actions setup

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

---

## Config reference

Place `codeanchor.config.json` in your repo root. All fields are optional.

Full config reference with all rule options: [docs/config.md](docs/config.md).

```json
{
    "exclude": ["dist/**", "*.generated.ts", "vendor/**"],
    "rules": {
        "CA-CD001": { "severity": "error", "maxOwnershipDistance": 20 },
        "CA-DOCS001": { "severity": "error" },
        "CA-DOCS002": { "severity": "error" },
        "CA-CI001": { "severity": "error" },
        "CA-DOCKER001": { "severity": "warn" },
        "CA-PKG001": { "severity": "error" },
        "CA-TEST001": { "severity": "warn" },
        "CA-OWN001": { "severity": "warn" },
        "CA-TODO003": { "severity": "warn" },
        "ISO-SEC001": { "severity": "error" }
    }
}
```

Disable a rule entirely:

```json
{ "rules": { "CA-DOCKER001": false } }
```

---

## Approvals (CA-CD001)

If a comment intentionally describes behavior that differs from the current code, approve it:

```bash
codeanchor approve src/api.ts 12
codeanchor approve src/utils.py 8
codeanchor approve src/Auth.java 22
```

Approvals are stored in `.commentguard/approvals.json` and are invalidated automatically if either the comment or the code beneath it changes.

---

## Exit codes

| Code | Meaning                             |
| ---- | ----------------------------------- |
| 0    | No error-severity findings          |
| 1    | One or more error-severity findings |
| 2    | Config or usage error               |

Use `--fail-on-warn` to exit 1 on warnings too.

---

## Companion ESLint plugin

[`@farisabujolban/eslint-plugin-codeanchor`](https://github.com/farisabujolban/eslint-plugin-codeanchor) covers AST-level single-file checks that this CLI cannot: issue-linked TODOs, expired comment deadlines, hardcoded credentials in assignments, insecure `Math.random()` usage, `JSON.parse()` without try/catch, and more. Run both for full coverage.

```bash
npm install --save-dev @farisabujolban/eslint-plugin-codeanchor
```

---

## Contributing

```bash
git clone https://github.com/farisabujolban/codeanchor
cd codeanchor
npm install
npm test
npm run build
```

Tests use Vitest. Rules that check staged files create real temporary git repos in tests.

## License

MIT © Faris Abujolban
