# codeanchor — Config Reference

← [Back to README](../README.md)

---

## `codeanchor.config.json`

Place this file in your repo root. All fields are optional. Missing fields fall back to defaults.

```json
{
    "exclude": [],
    "rules": {}
}
```

---

## `exclude`

An array of glob patterns for files and directories to skip across all rules.

```json
{
    "exclude": ["dist/**", "build/**", "*.generated.ts", "vendor/**", "coverage/**"]
}
```

Patterns are matched against repo-relative file paths using standard glob syntax. Use `**` for recursive matching.

---

## `rules`

A map of rule ID to rule config. Each entry is either:

- An object `{ "severity": "error" | "warn" | "info" }` to override the default severity
- `false` to disable the rule entirely

```json
{
    "rules": {
        "CA-CI001": { "severity": "error" },
        "CA-DOCKER001": false
    }
}
```

The engine always applies the severity from this config, so you can promote any `warn` to `error` or demote any `error` to `warn`.

---

## Per-rule options

Most rules accept only `severity`. These rules have additional options:

### CA-CD001 — `maxOwnershipDistance`

How many lines below a comment it is considered to "own". When code changes within that distance of a comment, the rule fires if the comment wasn't also updated.

```json
{ "CA-CD001": { "severity": "error", "maxOwnershipDistance": 20 } }
```

| Option                 | Type     | Default | Description                                                                           |
| ---------------------- | -------- | ------- | ------------------------------------------------------------------------------------- |
| `maxOwnershipDistance` | `number` | `20`    | Lines below a comment counted as owned. Increase for files with dense comment blocks. |

---

### ISO-MAI002 — `threshold`

```json
{ "ISO-MAI002": { "severity": "warn", "threshold": 15 } }
```

| Option      | Type     | Default | Description                                        |
| ----------- | -------- | ------- | -------------------------------------------------- |
| `threshold` | `number` | `10`    | Maximum exported symbols per file before flagging. |

---

### ISO-MAI003 — `threshold`

```json
{ "ISO-MAI003": { "severity": "info", "threshold": 20 } }
```

| Option      | Type     | Default | Description                                                                |
| ----------- | -------- | ------- | -------------------------------------------------------------------------- |
| `threshold` | `number` | `15`    | Maximum number of internal files that can import a module before flagging. |

---

## Complete example

```json
{
    "exclude": ["dist/**", "node_modules/**", "*.generated.ts", "coverage/**"],
    "rules": {
        "CA-CD001": { "severity": "error", "maxOwnershipDistance": 25 },
        "CA-CI001": { "severity": "error" },
        "CA-CI004": false,
        "CA-DOCKER001": { "severity": "warn" },
        "CA-DOCKER003": false,
        "CA-DOCS001": { "severity": "error" },
        "CA-DOCS002": { "severity": "error" },
        "CA-ENV001": { "severity": "warn" },
        "CA-LOCK001": { "severity": "error" },
        "CA-PKG001": { "severity": "error" },
        "CA-PKG002": { "severity": "error" },
        "CA-PUBLISH001": { "severity": "error" },
        "CA-TEST001": { "severity": "warn" },
        "CA-OWN001": { "severity": "warn" },
        "CA-TODO003": { "severity": "warn" },
        "ISO-MAI001": { "severity": "error" },
        "ISO-MAI002": { "threshold": 15 },
        "ISO-MAI003": false,
        "ISO-MAI004": false,
        "ISO-SEC001": { "severity": "error" },
        "ISO-SEC002": { "severity": "error" }
    }
}
```

---

## Defaults

Rules not listed in your config use their default severities. See [rules.md](rules.md) for each rule's default.

Rules you set to `false` are never run, regardless of scan mode.
