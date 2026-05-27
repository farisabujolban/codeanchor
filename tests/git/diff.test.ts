import { describe, it, expect } from 'vitest'
import { parseDiff, diffTouchesRange } from '../../src/git/diff.js'

// @@ -10,4 +10,4 @@ → newLineNum=10, then: context(11), removed(stays 11), added(add 11, 12), context(13)
const SAMPLE_TS_DIFF = `diff --git a/src/api.ts b/src/api.ts
index abc..def 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -10,4 +10,4 @@
 function foo() {
-  return old()
+  return new()
 }`

// @@ -5,3 +5,3 @@ → newLineNum=5, context(6), removed(stays 6), added(add 6, 7)
const SAMPLE_PY_DIFF = `diff --git a/utils.py b/utils.py
index abc..def 100644
--- a/utils.py
+++ b/utils.py
@@ -5,3 +5,3 @@
 def bar():
-  return old
+  return new`

// @@ -20,4 +20,4 @@ → newLineNum=20, context(21), removed(stays 21), added(add 21, 22), context(23)
const SAMPLE_JAVA_DIFF = `diff --git a/Auth.java b/Auth.java
index abc..def 100644
--- a/Auth.java
+++ b/Auth.java
@@ -20,4 +20,4 @@
 public void auth() {
-  return false;
+  return true;
 }`

const ADDED_FILE_DIFF = `diff --git a/new.ts b/new.ts
index 0000000..abc1234 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
+const x = 1
+const y = 2
+export { x, y }`

describe('parseDiff', () => {
  it('parses a TypeScript diff', () => {
    const result = parseDiff(SAMPLE_TS_DIFF)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('src/api.ts')
    expect(result[0].status).toBe('modified')
    expect(result[0].changedLines.has(11)).toBe(true)
  })

  it('parses a Python diff', () => {
    const result = parseDiff(SAMPLE_PY_DIFF)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('utils.py')
    expect(result[0].changedLines.has(6)).toBe(true)
  })

  it('parses a Java diff', () => {
    const result = parseDiff(SAMPLE_JAVA_DIFF)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('Auth.java')
    expect(result[0].changedLines.has(21)).toBe(true)
  })

  it('marks added file status', () => {
    const result = parseDiff(ADDED_FILE_DIFF)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('new.ts')
    expect(result[0].status).toBe('added')
  })

  it('returns empty array for empty diff', () => {
    expect(parseDiff('')).toHaveLength(0)
  })

  it('does not add removed lines to changedLines', () => {
    const result = parseDiff(SAMPLE_TS_DIFF)
    // The removed line (-  return old()) doesn't get added to changedLines
    // Only the + line does; the context lines advance the counter
    expect(result[0].changedLines.size).toBe(1)
    expect(result[0].changedLines.has(11)).toBe(true)
  })
})

describe('diffTouchesRange', () => {
  it('returns true when a changed line falls within the range', () => {
    const diff = { path: 'foo.ts', status: 'modified' as const, changedLines: new Set([10, 11, 12]) }
    expect(diffTouchesRange(diff, 10, 15)).toBe(true)
    expect(diffTouchesRange(diff, 8, 10)).toBe(true)
  })

  it('returns false when no changed line is in range', () => {
    const diff = { path: 'foo.ts', status: 'modified' as const, changedLines: new Set([5, 6]) }
    expect(diffTouchesRange(diff, 10, 15)).toBe(false)
  })

  it('handles single-line range', () => {
    const diff = { path: 'foo.ts', status: 'modified' as const, changedLines: new Set([7]) }
    expect(diffTouchesRange(diff, 7, 7)).toBe(true)
    expect(diffTouchesRange(diff, 8, 8)).toBe(false)
  })
})
