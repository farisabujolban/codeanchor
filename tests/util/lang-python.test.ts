import { describe, it, expect } from 'vitest'
import { pythonDriver } from '../../src/util/lang-python.js'
import { extractLeadingComments } from '../../src/util/comment-parser.js'
import { shouldIgnoreComment } from '../../src/util/ignore-rules.js'
import type { Comment } from '../../src/types.js'

function makeComment(text: string): Comment {
  return { type: 'line', text, startLine: 1, endLine: 1, ownedCodeStartLine: 2 }
}

describe('pythonDriver', () => {
  describe('isCodeLine', () => {
    it('returns true for code', () => {
      expect(pythonDriver.isCodeLine('x = 1')).toBe(true)
      expect(pythonDriver.isCodeLine('def foo():')).toBe(true)
    })
    it('returns false for # comment', () => {
      expect(pythonDriver.isCodeLine('# comment')).toBe(false)
      expect(pythonDriver.isCodeLine('  # indented comment')).toBe(false)
    })
    it('returns false for blank line', () => {
      expect(pythonDriver.isCodeLine('')).toBe(false)
      expect(pythonDriver.isCodeLine('   ')).toBe(false)
    })
  })

  describe('isCommentLine', () => {
    it('recognizes # line', () => {
      expect(pythonDriver.isCommentLine('# comment')).toBe(true)
      expect(pythonDriver.isCommentLine('  # indented')).toBe(true)
    })
    it('returns false for code', () => {
      expect(pythonDriver.isCommentLine('x = 1')).toBe(false)
    })
  })
})

describe('extractLeadingComments (python)', () => {
  it('extracts a single # comment before code', () => {
    const content = '# comment\nx = 1\n'
    const comments = extractLeadingComments(content, pythonDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].type).toBe('line')
    expect(comments[0].startLine).toBe(1)
    expect(comments[0].endLine).toBe(1)
    expect(comments[0].ownedCodeStartLine).toBe(2)
    expect(comments[0].text).toBe('# comment')
  })

  it('extracts consecutive # lines as one block', () => {
    const content = '# line1\n# line2\nx = 1\n'
    const comments = extractLeadingComments(content, pythonDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].startLine).toBe(1)
    expect(comments[0].endLine).toBe(2)
    expect(comments[0].text).toContain('# line1')
    expect(comments[0].text).toContain('# line2')
  })

  it('extracts single-line """ docstring in a def block', () => {
    const content = 'def foo():\n    """This is a docstring."""\n    return 1\n'
    const comments = extractLeadingComments(content, pythonDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].type).toBe('block')
    expect(comments[0].startLine).toBe(2)
    expect(comments[0].endLine).toBe(2)
    expect(comments[0].ownedCodeStartLine).toBe(3)
  })

  it('extracts multi-line """ docstring in a def block', () => {
    const content = 'def foo():\n    """\n    Multi-line.\n    """\n    return 1\n'
    const comments = extractLeadingComments(content, pythonDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].startLine).toBe(2)
    expect(comments[0].endLine).toBe(4)
    expect(comments[0].ownedCodeStartLine).toBe(5)
  })

  it('extracts module-level """ docstring at file start', () => {
    const content = '"""Module docstring."""\nimport os\n'
    const comments = extractLeadingComments(content, pythonDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].startLine).toBe(1)
  })

  it('does not extract assigned string literal as docstring', () => {
    const content = 'x = """not a docstring"""\ny = 1\n'
    const comments = extractLeadingComments(content, pythonDriver)
    expect(comments).toHaveLength(0)
  })

  it('does not extract comment with no following code', () => {
    const content = '# trailing comment\n'
    expect(extractLeadingComments(content, pythonDriver)).toHaveLength(0)
  })
})

describe('shouldIgnoreComment (python)', () => {
  it('ignores # type: ignore', () => {
    expect(shouldIgnoreComment(makeComment('# type: ignore'), pythonDriver)).toBe(true)
  })

  it('ignores # noqa: E501', () => {
    expect(shouldIgnoreComment(makeComment('# noqa: E501'), pythonDriver)).toBe(true)
  })

  it('ignores # pylint: disable', () => {
    expect(shouldIgnoreComment(makeComment('# pylint: disable=line-too-long'), pythonDriver)).toBe(true)
  })

  it('ignores # fmt: off', () => {
    expect(shouldIgnoreComment(makeComment('# fmt: off'), pythonDriver)).toBe(true)
  })

  it('does not ignore a regular descriptive comment', () => {
    expect(shouldIgnoreComment(makeComment('# Handles user authentication logic'), pythonDriver)).toBe(false)
  })
})
