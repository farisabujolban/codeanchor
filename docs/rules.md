# codeanchor — Rule Reference

Full reference for all 55 rules. Each entry lists the description, applicable scan modes, default severity, and any configurable options.

← [Back to README](../README.md)

---

## CA-\* rules

### Git / Code integrity

---

#### CA-CD001

**Code changed but leading comment was not updated.**

Flags source files where the leading comment block (directly above a function, class, or block) has not been updated in the same commit/stage as the code it describes. Supports JS, TS, Java, C, C++, C#, Go, and Python.

|                  |          |
| ---------------- | -------- |
| Mode             | `staged` |
| Default severity | error    |

**Supported languages:**

| Language                | Extensions                                   | Comment syntax          |
| ----------------------- | -------------------------------------------- | ----------------------- |
| JavaScript / TypeScript | `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs` | `//`, `/* */`, `/** */` |
| Java                    | `.java`                                      | `//`, `/* */`, `/** */` |
| C / C++                 | `.c`, `.h`, `.cpp`, `.hpp`, `.cc`            | `//`, `/* */`           |
| C#                      | `.cs`                                        | `//`, `/* */`           |
| Go                      | `.go`                                        | `//`, `/* */`           |
| Python                  | `.py`                                        | `#`, `"""docstrings"""` |

**Options:**

| Option                 | Type     | Default | Description                                                                                                            |
| ---------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `maxOwnershipDistance` | `number` | `20`    | Lines below a comment that it "owns". Increase for files with dense comment blocks; decrease for stricter enforcement. |

**Approving intentional drift:** See [Approvals (CA-CD001)](../README.md#approvals-ca-cd001).

---

#### CA-CHANGELOG001

**`package.json` version has no matching entry in `CHANGELOG.md`.**

In `staged` mode: only triggers when `package.json` is staged and the version differs from HEAD. In `repo` mode: checks whether the current version has a matching `## [x.y.z]` heading.

|                  |                  |
| ---------------- | ---------------- |
| Mode             | `repo`, `staged` |
| Default severity | warn             |

---

#### CA-EXPORT001

**Symbol silently removed from a public module index — potential breaking change.**

Detects when a named export is removed from a file that looks like a public index (e.g., `src/index.ts`). Applies to JS/TS.

|                  |                |
| ---------------- | -------------- |
| Mode             | `pr`, `staged` |
| Default severity | warn           |

---

### CI/CD

---

#### CA-CI001

**GitHub Actions workflow references a missing npm script.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-CI002

**`setup-node` version doesn't match `.nvmrc` or `engines.node`.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

#### CA-CI003

**GitHub Actions workflow references a local path that doesn't exist.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-CI004

**Workflow uses unpinned action ref instead of a full commit SHA.**

Pinning to a full SHA (e.g., `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`) prevents supply chain attacks from mutable tags like `@v4`.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

#### CA-CI005

**Workflow `needs:` references a job that doesn't exist in the same file.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

### Docker

---

#### CA-DOCKER001

**Dockerfile `COPY`/`ADD` references a source path that doesn't exist.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

#### CA-DOCKER002

**Dockerfile `RUN`/`CMD`/`ENTRYPOINT` references a missing script or file.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

#### CA-DOCKER003

**Dockerfile `FROM` version doesn't match `.nvmrc`, `engines.node`, or `go.mod`.**

Detects version drift between the base image and the version declared in the project's runtime config files.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

#### CA-DOCKER004

**Dockerfile sets a credential-named `ENV`/`ARG` with a hardcoded non-empty default.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-DOCKER005

**Dockerfile exists but `.dockerignore` is missing or doesn't exclude sensitive paths.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-COMPOSE001

**Docker Compose `depends_on`, `volumes`, or `networks` reference an undeclared name.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-COMPOSE002

**Docker Compose `env_file` or `build.dockerfile` references a missing path.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

### Package / npm

---

#### CA-PKG001

**`package.json` script references a local file that doesn't exist.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-PKG002

**`package.json` entrypoint field (`main`, `exports`, etc.) references a missing path.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-PKG003

**`exports` field references a `dist` path not covered by the `files` field — will be excluded from npm publish.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-PKG004

**`package.json` script calls `npm run` with a script name that is not defined in `scripts`.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-LOCK001

**Dependency fields changed but no lockfile was updated.**

Triggers when `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` are staged but no `package-lock.json` or `yarn.lock` change is included.

|                  |                |
| ---------------- | -------------- |
| Mode             | `staged`, `pr` |
| Default severity | error          |

---

#### CA-DEPS001

**Production dependency only imported in test files — should be `devDependencies`.**

|                  |        |
| ---------------- | ------ |
| Mode             | `repo` |
| Default severity | warn   |

---

#### CA-PUBLISH001

**`npm publish` may ship source maps, env files, or all repo files due to missing publish config.**

Checks for a `files` field or `.npmignore`. Without one, `npm publish` ships everything not in `.gitignore`.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-MONO001

**Same dependency declared at different versions across monorepo workspace packages.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

### Documentation

---

#### CA-DOCS001

**README/docs reference a missing npm script.**

Checks `README.md` and all files under `docs/` for backtick-enclosed script invocations (`npm run`, `pnpm`, `yarn`) that reference a script name not present in `package.json`.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-DOCS002

**README/docs have a broken relative Markdown link.**

Checks `README.md` and all files under `docs/` for relative Markdown links (those beginning with `./` or `../`) pointing to files that don't exist on disk.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-DOCS004

**README/docs reference a hardcoded package version that doesn't match `package.json`.**

Detects `pkgName@X.Y.Z` install examples and static `shields.io/badge/version-X.Y.Z` badges that are out of sync with the current `package.json` version.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

### Environment & secrets

---

#### CA-ENV001

**`.env.example` is missing keys that exist in other tracked env files.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

#### CA-ENV002

**`.env` file tracked by git — may expose secrets.**

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | error                  |

---

#### CA-ENV003

**`.env` file exists on disk but is not covered by `.gitignore` — one `git add .` away from leaking secrets.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

### Config drift

---

#### CA-CONFIG001

**A config key present in one environment config file is absent from another.**

Compares `config/development.json`, `config/production.json`, etc. and flags keys that are only in a subset of files.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

#### CA-TSCONFIG001

**`tsconfig.json` `include`, `paths`, `baseUrl`, or `rootDir` references a path that doesn't exist.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-TSCONFIG002

**`tsconfig.json` doesn't enable `strict` mode.**

|                  |        |
| ---------------- | ------ |
| Mode             | `repo` |
| Default severity | warn   |

---

### Infrastructure

---

#### CA-MAKEFILE001

**Makefile calls `$(MAKE)` with a target not defined in the same file.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### CA-MIGRATION001

**Migration file has no corresponding rollback (down) migration.**

|                  |        |
| ---------------- | ------ |
| Mode             | `repo` |
| Default severity | warn   |

---

#### CA-OPENAPI001

**Code route not documented in OpenAPI spec, or spec has an orphaned path with no matching code route.**

v1 supports JS/TS frameworks (Express, Fastify). Extend via `ROUTE_DETECTORS` for Flask, Gin, Spring, Rails.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |

---

#### CA-ROUTE001

**URL param name doesn't match the `req.params` key accessed in the handler — silent `undefined` at runtime.**

v1 supports Express/Fastify. Extend via `PARAM_DETECTORS` for Flask, Gin, Django.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | error                  |

---

### Code quality

---

#### CA-FEAT001

**Feature flag key referenced in code not declared in the flags config file.**

Requires `configFile` in the rule config. Works for any language — configure `pattern` to match your SDK.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |

---

#### CA-I18N001

**i18n key used in code not present in any locale file.**

v1 supports JS/TS/Vue/Svelte. Add entries to `DETECTORS` for other languages.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | error                  |

---

#### CA-PLAN001

**Plan file missing required AI model or intelligence level in YAML frontmatter.**

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `staged`, `pr` |
| Default severity | warn                   |

---

### History & ownership

---

#### CA-TEST001

**Frequently changed file has no associated test.**

Runs over git history (`--history --since 90d` by default). Only reports hot files — those changed more than a configurable threshold number of times. For a full audit of all source files, see ISO-MAI004.

|                  |           |
| ---------------- | --------- |
| Mode             | `history` |
| Default severity | warn      |

---

#### CA-TEST002

**Source changed much more often than its test — test may be stale.**

|                  |           |
| ---------------- | --------- |
| Mode             | `history` |
| Default severity | warn      |

---

#### CA-OWN001

**Frequently changed file has no CODEOWNERS entry.**

|                  |           |
| ---------------- | --------- |
| Mode             | `history` |
| Default severity | warn      |

---

#### CA-OWN002

**CODEOWNERS pattern matches no tracked files — likely stale after a rename or delete.**

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

---

#### CA-TODO003

**TODO/FIXME/HACK older than 90 days with no issue link.**

In `staged` mode: flags any `FIXME` regardless of age. In `history` mode: checks age via git blame.

|                  |                     |
| ---------------- | ------------------- |
| Mode             | `history`, `staged` |
| Default severity | warn                |

---

## ISO quality checks

The ISO family checks language-level code patterns against ISO 5055 and ISO/IEC 25010 quality characteristics. These rules inspect source files rather than cross-file references, and run in `repo`/`pr`/`staged` modes.

See [README — ISO quality checks](../README.md#iso-quality-checks) for opt-out instructions.

---

### ISO-MAI — Maintainability

---

#### ISO-MAI001

**Circular import between modules.**

Detects import cycles between JS/TS modules (relative imports) and Python relative imports. Circular dependencies make modules hard to test and understand.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | error        |

---

#### ISO-MAI002

**File exports too many public symbols — low cohesion.**

A module with a very large public surface is likely doing too many things.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | warn         |

**Options:**

| Option      | Type     | Default | Description                                         |
| ----------- | -------- | ------- | --------------------------------------------------- |
| `threshold` | `number` | `10`    | Maximum number of exported symbols before flagging. |

```json
{ "ISO-MAI002": { "threshold": 15 } }
```

---

#### ISO-MAI003

**Module has high afferent coupling — too many internal files import it.**

A module with many dependents has a large blast radius when changed. High fan-in is a signal to consider splitting the module or inverting dependencies.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | info         |

**Options:**

| Option      | Type     | Default | Description                                           |
| ----------- | -------- | ------- | ----------------------------------------------------- |
| `threshold` | `number` | `15`    | Maximum number of internal importers before flagging. |

```json
{ "ISO-MAI003": { "threshold": 20 } }
```

---

#### ISO-MAI004

**Source file has no corresponding test file.**

Unlike CA-TEST001 (which audits only hot files from git history), ISO-MAI004 audits all tracked source files.

|                  |              |
| ---------------- | ------------ |
| Mode             | `repo`, `pr` |
| Default severity | info         |

---

### ISO-REL — Reliability

---

#### ISO-REL001

**Empty catch block silently swallows exceptions (CWE-390).**

Applies to JS/TS, Java, C/C++, C#, and Python.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |

---

#### ISO-REL002

**Direct recursive function call — unbounded stack risk.**

Recursion can cause unbounded stack growth. Flagged for MISRA-C:2012 Rule 17.2 spirit and ISO 26262 Part 6. Applies to JS/TS (named function declarations and expressions) and Python (`def` functions).

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |

---

#### ISO-REL003

**Floating-point exact equality comparison (CWE-1339).**

IEEE 754 arithmetic makes exact float comparisons unreliable. Use an epsilon/tolerance check instead. Applies to JS/TS (`===`, `!==`), Java, C/C++ (`==`, `!=`), and Python.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |

---

#### ISO-REL004

**Catch block catches a generic exception type without re-throwing (CWE-396).**

Catching `Exception`/`Throwable` (Java) or bare `except`/`Exception` (Python) without re-throwing swallows unexpected errors and masks bugs. Applies to Java and Python only — JS/TS lacks a typed exception hierarchy.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |

---

### ISO-SEC — Security

---

#### ISO-SEC001

**Broken or weak cryptographic algorithm used (CWE-327).**

Detects usage of MD5, SHA-1, DES, RC4, and Blowfish. Applies to JS/TS (Node.js `crypto`), Python (`hashlib`, `cryptography`), and Java (JCA).

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |

---

#### ISO-SEC002

**ReDoS-vulnerable regex pattern — nested quantifiers (CWE-1333).**

Patterns like `(a+)+` allow exponential matching time on crafted inputs.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |

---

### ISO-POR — Portability

---

#### ISO-POR001

**Hardcoded Windows path separator `\` in a string literal.**

Backslash separators break cross-platform builds. Use `path.join()`, `os.path.join()`, or `Paths.get()` with forward slashes instead.

|                  |                        |
| ---------------- | ---------------------- |
| Mode             | `repo`, `pr`, `staged` |
| Default severity | warn                   |
