# codeanchor

`codeanchor` catches the class of bugs that ESLint, Prettier, and type checkers cannot: broken references between your repo's moving parts. Docs that reference deleted scripts. CI workflows that call scripts that don't exist. Dockerfiles that COPY paths that were renamed. Comments that silently lie about the code beneath them.

It does not replace any existing tool. It runs alongside them.

---

## The problem it solves

You rename `scripts/build.js` to `scripts/bundle.js`. Your README still says `npm run build`, your CI workflow still calls it, and your Dockerfile still tries to COPY the old path. Nothing fails until you deploy or onboard a new engineer. `codeanchor` catches this before the commit lands.

---

## Rules

| ID | Description | Mode | Default Severity | Languages |
|---|---|---|---|---|
| CA-CD001 | Leading comment not updated after code changed | `staged` | error | JS, TS, Java, C, C++, C#, Go, Python |
| CA-DOCS001 | README/docs reference an npm script missing from `package.json` | `repo`, `pr` | error | Markdown |
| CA-DOCS002 | README/docs have a broken local Markdown link | `repo`, `pr` | error | Markdown |
| CA-DOCS003 | README/docs mention a backtick-enclosed local path that doesn't exist | `repo`, `pr` | warn | Markdown |
| CA-CI001 | GitHub Actions workflow references a missing npm script | `repo`, `pr` | error | YAML |
| CA-CI003 | GitHub Actions workflow references a local path that doesn't exist | `repo`, `pr` | error | YAML |
| CA-DOCKER001 | Dockerfile `COPY`/`ADD` references a path that doesn't exist | `repo`, `pr` | warn | Dockerfile |
| CA-DOCKER002 | Dockerfile `RUN`/`CMD`/`ENTRYPOINT` references a missing script or file | `repo`, `pr` | warn | Dockerfile |
| CA-PKG001 | `package.json` script references a local file that doesn't exist | `repo`, `pr` | error | JSON |
| CA-PKG002 | `package.json` entrypoint field (`main`, `exports`, etc.) references a missing file | `repo`, `pr` | error | JSON |
| CA-LOCK001 | Dependency fields changed in `package.json` but no lockfile was updated | `staged`, `pr` | error | JSON |
| CA-TEST001 | Frequently changed file has no associated test | `history` | warn | All |
| CA-TEST002 | Source changed much more often than its test — test may be stale | `history` | warn | All |
| CA-OWN001 | Frequently changed file has no CODEOWNERS entry | `history` | warn | All |
| CA-TODO003 | TODO/FIXME/HACK older than 90 days with no issue link | `history` | warn | All |

---

## Installation

```bash
npm install -g codeanchor
```

Or use without installing:

```bash
npx codeanchor scan --repo
```

---

## Quick start

**Pre-commit (staged files only):**
```bash
codeanchor scan --staged
```

**Full repo scan:**
```bash
codeanchor scan --repo
```

**PR diff (e.g. in CI):**
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
          node-version: '20'
      - run: npx codeanchor scan --base origin/main --head HEAD
```

---

## Config reference

Place `codeanchor.config.json` in your repo root. All fields are optional.

```json
{
  "exclude": ["dist/**", "*.generated.ts", "vendor/**"],
  "rules": {
    "CA-CD001":     { "severity": "error", "maxOwnershipDistance": 20 },
    "CA-DOCS001":   { "severity": "error" },
    "CA-DOCS002":   { "severity": "error" },
    "CA-CI001":     { "severity": "error" },
    "CA-DOCKER001": { "severity": "warn" },
    "CA-PKG001":    { "severity": "error" },
    "CA-TEST001":   { "severity": "warn" },
    "CA-TEST002":   { "severity": "warn" },
    "CA-OWN001":    { "severity": "warn" },
    "CA-TODO003":   { "severity": "warn" }
  }
}
```

Disable a rule entirely:

```json
{ "rules": { "CA-DOCKER001": false } }
```

### `maxOwnershipDistance` (CA-CD001)

How many lines of code below a comment it owns. Default: 20. Increase for files with dense comment blocks; decrease for tighter enforcement.

---

## Approving intentional stale comments (CA-CD001)

If a comment intentionally describes behavior that differs from the current code:

```bash
codeanchor approve src/api.ts 12
codeanchor approve src/utils.py 8
codeanchor approve src/Auth.java 22
```

Approvals are stored in `.commentguard/approvals.json` and are invalidated automatically if either the comment or the code beneath it changes.

---

## Exit codes

| Code | Meaning |
|---|---|
| 0 | No error-severity findings |
| 1 | One or more error-severity findings |
| 2 | Config or usage error |

Use `--fail-on-warn` to exit 1 on warnings too.

---

## Supported languages (CA-CD001)

| Language | Extensions | Comment syntax |
|---|---|---|
| JavaScript / TypeScript | `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs` | `//`, `/* */`, `/** */` |
| Java | `.java` | `//`, `/* */`, `/** */` |
| C / C++ | `.c`, `.h`, `.cpp`, `.hpp`, `.cc` | `//`, `/* */` |
| C# | `.cs` | `//`, `/* */` |
| Go | `.go` | `//`, `/* */` |
| Python | `.py` | `#`, `"""docstrings"""` |

---

## Migrating from stale-comment-guard

`codeanchor` is a drop-in superset. Your existing `.commentguard/approvals.json` is read without migration.

| Old command | New command |
|---|---|
| `stale-comment-guard check` | `codeanchor scan --staged` |
| `stale-comment-guard approve <file> <line>` | `codeanchor approve <file> <line>` |

The config format changes from `.commentguard.json` to `codeanchor.config.json` under the `rules.CA-CD001` key. The old config is not read automatically — copy your settings across if needed.

---

## Demo

The `demo/` directory is an intentionally broken repo. Run:

```bash
cd demo
codeanchor scan --repo
```

Expected output will show violations for all Phase 1+2 rules.

---

## Contributing

```bash
git clone https://github.com/your-username/codeanchor
cd codeanchor
npm install
npm test
npm run build
```

Tests use `vitest`. Phase 1–2 tests use temporary file fixtures; Phase 3 tests create real temporary git repos.
