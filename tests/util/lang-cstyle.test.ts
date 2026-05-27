import { describe, it, expect } from 'vitest'
import { cstyleDriver } from '../../src/util/lang-cstyle.js'
import { extractLeadingComments } from '../../src/util/comment-parser.js'
import { shouldIgnoreComment } from '../../src/util/ignore-rules.js'
import type { Comment } from '../../src/types.js'

function makeComment(text: string): Comment {
  return { type: 'line', text, startLine: 1, endLine: 1, ownedCodeStartLine: 2 }
}

describe('cstyleDriver', () => {
  describe('isCodeLine', () => {
    it('returns true for a code line', () => {
      expect(cstyleDriver.isCodeLine('const x = 1')).toBe(true)
    })
    it('returns false for // comment', () => {
      expect(cstyleDriver.isCodeLine('  // comment')).toBe(false)
    })
    it('returns false for /* comment', () => {
      expect(cstyleDriver.isCodeLine('  /* comment */')).toBe(false)
    })
    it('returns false for * continuation line', () => {
      expect(cstyleDriver.isCodeLine('   * body')).toBe(false)
    })
    it('returns false for blank line', () => {
      expect(cstyleDriver.isCodeLine('')).toBe(false)
      expect(cstyleDriver.isCodeLine('   ')).toBe(false)
    })
  })

  describe('isCommentLine', () => {
    it('recognizes // line', () => {
      expect(cstyleDriver.isCommentLine('  // comment')).toBe(true)
    })
    it('recognizes /* line', () => {
      expect(cstyleDriver.isCommentLine('  /* comment */')).toBe(true)
    })
    it('recognizes * continuation line', () => {
      expect(cstyleDriver.isCommentLine('   * body')).toBe(true)
    })
    it('returns false for code', () => {
      expect(cstyleDriver.isCommentLine('const x = 1')).toBe(false)
    })
  })
})

describe('extractLeadingComments (cstyle)', () => {
  it('extracts a single // comment before code', () => {
    const content = '// This validates the token\nconst x = validate(token)\n'
    const comments = extractLeadingComments(content, cstyleDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].type).toBe('line')
    expect(comments[0].startLine).toBe(1)
    expect(comments[0].endLine).toBe(1)
    expect(comments[0].ownedCodeStartLine).toBe(2)
    expect(comments[0].text).toBe('// This validates the token')
  })

  it('extracts consecutive // lines as one block', () => {
    const content = '// Line one\n// Line two\nconst x = 1\n'
    const comments = extractLeadingComments(content, cstyleDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].startLine).toBe(1)
    expect(comments[0].endLine).toBe(2)
    expect(comments[0].ownedCodeStartLine).toBe(3)
  })

  it('extracts a /* */ block comment before code', () => {
    const content = '/* Assign the default value */\nvalue = 10\n'
    const comments = extractLeadingComments(content, cstyleDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].type).toBe('block')
    expect(comments[0].startLine).toBe(1)
    expect(comments[0].ownedCodeStartLine).toBe(2)
  })

  it('extracts multiline /** */ JSDoc before code', () => {
    const content = '/**\n * Processes the request\n */\nfunction process() {}\n'
    const comments = extractLeadingComments(content, cstyleDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].startLine).toBe(1)
    expect(comments[0].endLine).toBe(3)
    expect(comments[0].ownedCodeStartLine).toBe(4)
  })

  it('handles same-line block comment: /*comment*/code', () => {
    const content = '/*this assigns the value*/value = 10\n'
    const comments = extractLeadingComments(content, cstyleDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].startLine).toBe(1)
    expect(comments[0].endLine).toBe(1)
    expect(comments[0].ownedCodeStartLine).toBe(1)
  })

  it('does not extract comment followed only by another comment', () => {
    const content = '// First\n\n// Second\nconst x = 1\n'
    const comments = extractLeadingComments(content, cstyleDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].text).toBe('// Second')
  })

  it('returns empty array for comment-only file', () => {
    const content = '// Just a comment\n// Another comment\n'
    expect(extractLeadingComments(content, cstyleDriver)).toHaveLength(0)
  })

  it('handles blank lines between comment and code (ownedCodeStartLine is line after comment)', () => {
    const content = '// Setup auth\n\n\nconst auth = new Auth()\n'
    const comments = extractLeadingComments(content, cstyleDriver)
    expect(comments).toHaveLength(1)
    expect(comments[0].ownedCodeStartLine).toBe(2)
  })
})

describe('shouldIgnoreComment (cstyle)', () => {
  it('ignores eslint-disable directives', () => {
    expect(shouldIgnoreComment(makeComment('// eslint-disable-next-line no-console'), cstyleDriver)).toBe(true)
    expect(shouldIgnoreComment(makeComment('/* eslint-disable */'), cstyleDriver)).toBe(true)
  })

  it('ignores prettier-ignore', () => {
    expect(shouldIgnoreComment(makeComment('// prettier-ignore'), cstyleDriver)).toBe(true)
  })

  it('ignores @ts-ignore and friends', () => {
    expect(shouldIgnoreComment(makeComment('// @ts-ignore'), cstyleDriver)).toBe(true)
    expect(shouldIgnoreComment(makeComment('// @ts-expect-error'), cstyleDriver)).toBe(true)
    expect(shouldIgnoreComment(makeComment('// @ts-nocheck'), cstyleDriver)).toBe(true)
  })

  it('ignores // nolint (Go directive)', () => {
    expect(shouldIgnoreComment(makeComment('// nolint: errcheck'), cstyleDriver)).toBe(true)
  })

  it('ignores @SuppressWarnings (Java directive)', () => {
    expect(shouldIgnoreComment(makeComment('// @SuppressWarnings("unchecked")'), cstyleDriver)).toBe(true)
  })

  it('ignores license/copyright headers', () => {
    expect(shouldIgnoreComment(makeComment('// Copyright 2024 Acme Corp'), cstyleDriver)).toBe(true)
    expect(shouldIgnoreComment(makeComment('// MIT License'), cstyleDriver)).toBe(true)
  })

  it('ignores TODO-only comments', () => {
    expect(shouldIgnoreComment(makeComment('// TODO:'), cstyleDriver)).toBe(true)
    expect(shouldIgnoreComment(makeComment('// FIXME:'), cstyleDriver)).toBe(true)
    expect(shouldIgnoreComment(makeComment('// NOTE:'), cstyleDriver)).toBe(true)
  })

  it('ignores commented-out code', () => {
    expect(shouldIgnoreComment(makeComment('// const x = new Foo()'), cstyleDriver)).toBe(true)
    expect(shouldIgnoreComment(makeComment('// return result;'), cstyleDriver)).toBe(true)
    expect(shouldIgnoreComment(makeComment('// import foo from "bar"'), cstyleDriver)).toBe(true)
  })

  it('does not ignore normal descriptive comments', () => {
    expect(shouldIgnoreComment(makeComment('// Validates the JWT token before granting access'), cstyleDriver)).toBe(false)
    expect(shouldIgnoreComment(makeComment('// Retry up to 3 times on network failure'), cstyleDriver)).toBe(false)
  })
})
