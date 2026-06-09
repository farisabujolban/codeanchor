import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Finding } from '../types.js'
import type { Rule, RuleContext } from '../engine.js'
import { isExcluded } from '../util/exclude.js'

const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const PYTHON_EXTS = new Set(['.py'])
const JAVA_EXTS = new Set(['.java'])

// Strip C-style line comments (// ...) and block comments (/* ... */)
function stripCComments(s: string): string {
  return s
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
}

// Strip Python # comments
function stripHashComments(s: string): string {
  return s.replace(/#[^\n]*/g, m => ' '.repeat(m.length))
}

// Get 1-based line number at a character position
function lineAt(content: string, pos: number): number {
  let line = 1
  for (let i = 0; i < pos; i++) if (content[i] === '\n') line++
  return line
}

// Weak algorithm names (lower-cased for matching)
// Grouped to produce a readable label in the finding message
const WEAK_ALGO_LABEL: Record<string, string> = {
  md5: 'MD5', md4: 'MD4', md2: 'MD2',
  sha1: 'SHA-1', 'sha-1': 'SHA-1',
  des: 'DES', '3des': '3DES', 'triple-des': 'Triple-DES', 'tripledes': '3DES', 'desede': '3DES',
  rc4: 'RC4', arcfour: 'RC4',
  blowfish: 'Blowfish',
}

// JS/TS Node.js crypto patterns — weak algorithm name as a string argument
// e.g. createHash('md5'), createCipheriv('des', ...), .digest('md5')
// Also: require('md5') and import ... from 'md5'
const JS_TS_PATTERNS: Array<{ re: RegExp; labelIndex: number }> = [
  // crypto.createHash('md5') / createHash("sha1")
  {
    re: /\bcreateHash\s*\(\s*['"]([^'"]+)['"]/g,
    labelIndex: 1,
  },
  // createCipheriv('des', ...) / createDecipheriv('rc4', ...)
  {
    re: /\bcreate(?:Cipher|Decipher)iv\s*\(\s*['"]([^'"]+)['"]/g,
    labelIndex: 1,
  },
  // .digest('md5')  — used on crypto.Hash objects
  {
    re: /\.digest\s*\(\s*['"]([^'"]+)['"]/g,
    labelIndex: 1,
  },
  // require('md5') / require('node-md5') etc.
  {
    re: /\brequire\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g,
    labelIndex: 1,
  },
  // import ... from 'md5'
  {
    re: /\bfrom\s+['"]([^'"./][^'"]*)['"]/g,
    labelIndex: 1,
  },
]

// Python patterns
const PYTHON_PATTERNS: Array<{ re: RegExp; labelIndex: number }> = [
  // hashlib.md5( / hashlib.sha1(
  {
    re: /\bhashlib\.([a-z0-9_-]+)\s*\(/g,
    labelIndex: 1,
  },
  // hashlib.new('md5', ...) / hashlib.new("sha1", ...)
  {
    re: /\bhashlib\.new\s*\(\s*['"]([^'"]+)['"]/g,
    labelIndex: 1,
  },
  // from hashlib import md5, sha1
  {
    re: /\bfrom\s+hashlib\s+import\s+([^\n#]+)/g,
    labelIndex: 1,
  },
  // from cryptography.hazmat.primitives.hashes import MD5, SHA1
  {
    re: /\bfrom\s+cryptography\.hazmat\.primitives\.hashes\s+import\s+([^\n#]+)/g,
    labelIndex: 1,
  },
  // from Crypto.Hash import MD5, SHA1 (PyCryptodome)
  {
    re: /\bfrom\s+Crypto\.Hash\s+import\s+([^\n#]+)/g,
    labelIndex: 1,
  },
]

// Java patterns (JCA)
const JAVA_PATTERNS: Array<{ re: RegExp; labelIndex: number }> = [
  // MessageDigest.getInstance("MD5") / MessageDigest.getInstance("SHA-1")
  {
    re: /\bMessageDigest\.getInstance\s*\(\s*"([^"]+)"/g,
    labelIndex: 1,
  },
  // Cipher.getInstance("DES") / Cipher.getInstance("DES/ECB/PKCS5Padding")
  {
    re: /\bCipher\.getInstance\s*\(\s*"([^"]+)"/g,
    labelIndex: 1,
  },
  // SecretKeyFactory.getInstance("DES") / .getInstance("DESede")
  {
    re: /\bSecretKeyFactory\.getInstance\s*\(\s*"([^"]+)"/g,
    labelIndex: 1,
  },
  // KeyGenerator.getInstance("DES") / .getInstance("RC4") / .getInstance("ARCFOUR")
  {
    re: /\bKeyGenerator\.getInstance\s*\(\s*"([^"]+)"/g,
    labelIndex: 1,
  },
  // Mac.getInstance("HmacMD5") / Mac.getInstance("HmacSHA1")
  {
    re: /\bMac\.getInstance\s*\(\s*"([^"]+)"/g,
    labelIndex: 1,
  },
]

// Check whether a captured group value contains a weak algorithm name.
// For multi-name import lists (e.g. `from hashlib import md5, sha1`), split by comma.
function findWeakAlgo(captured: string): string | null {
  // Split on comma for multi-import cases
  const parts = captured.split(',')
  for (const part of parts) {
    const name = part.trim().toLowerCase()
    // Direct lookup
    if (WEAK_ALGO_LABEL[name]) return WEAK_ALGO_LABEL[name]
    // Prefix match for algorithm families like "sha1withrsa", "des/ecb/..."
    for (const key of Object.keys(WEAK_ALGO_LABEL)) {
      if (name.startsWith(key + '/') || name.startsWith(key + '-') ||
          name.startsWith(key + '_') || name === key ||
          // e.g. "sha1withrsa" starts with "sha1"
          (key.length >= 3 && name.startsWith(key) && (name.length === key.length || !/[a-z0-9]/.test(name[key.length])))) {
        return WEAK_ALGO_LABEL[key]
      }
    }
  }
  return null
}

interface WeakAlgoFinding {
  algoLabel: string
  line: number
}

function scanFile(
  stripped: string,
  patterns: Array<{ re: RegExp; labelIndex: number }>,
): WeakAlgoFinding[] {
  const results: WeakAlgoFinding[] = []
  const seen = new Set<string>()  // deduplicate line+algo pairs

  for (const { re } of patterns) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(stripped)) !== null) {
      const captured = m[1]
      if (!captured) continue

      const algoLabel = findWeakAlgo(captured)
      if (!algoLabel) continue

      const line = lineAt(stripped, m.index)
      const key = `${line}:${algoLabel}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ algoLabel, line })
    }
  }

  return results
}

export const isoSec001: Rule = {
  id: 'ISO-SEC001',
  description:
    'Use of a broken or weak cryptographic algorithm detected (ISO 5055 ASCSM-CWE-327, CWE-327). ' +
    'Algorithms such as MD5, SHA-1, DES, RC4, and Blowfish are cryptographically broken. ' +
    'Applies to JS/TS (Node.js crypto), Python (hashlib, cryptography), and Java (JCA).',
  defaultSeverity: 'warn',
  applicableModes: ['repo', 'pr', 'staged'],

  async run(ctx: RuleContext): Promise<Finding[]> {
    let filePaths: string[]

    if (ctx.mode === 'staged' && ctx.stagedDiffs) {
      filePaths = ctx.stagedDiffs
        .filter(d => d.status !== 'deleted')
        .map(d => d.path)
    } else {
      try {
        filePaths = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ctx.repoRoot })
          .split('\n')
          .filter(Boolean)
      } catch {
        return []
      }
    }

    const findings: Finding[] = []

    for (const relPath of filePaths) {
      if (isExcluded(relPath, ctx.config.exclude)) continue

      const ext = path.extname(relPath)
      const isJsTs = JS_TS_EXTS.has(ext)
      const isPython = PYTHON_EXTS.has(ext)
      const isJava = JAVA_EXTS.has(ext)

      if (!isJsTs && !isPython && !isJava) continue

      let content: string
      try {
        content = fs.readFileSync(path.join(ctx.repoRoot, relPath), 'utf-8')
      } catch { continue }

      const stripped = isJsTs || isJava
        ? stripCComments(content)
        : stripHashComments(content)

      const patterns = isJsTs ? JS_TS_PATTERNS : isPython ? PYTHON_PATTERNS : JAVA_PATTERNS
      const matches = scanFile(stripped, patterns)

      for (const { algoLabel, line } of matches) {
        findings.push({
          ruleId: 'ISO-SEC001',
          severity: 'warn',
          file: relPath,
          line,
          message:
            `Weak/broken cryptographic algorithm in use: ${algoLabel} (CWE-327). ` +
            `${algoLabel} is cryptographically broken and must not be used for security purposes.`,
          fix: 'Replace with a modern algorithm: SHA-256/SHA-3 for hashing, AES-256-GCM for encryption.',
        })
      }
    }

    return findings
  },
}
