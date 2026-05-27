export function stripJsoncComments(content: string): string {
  let withoutComments = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    const next = content[i + 1]

    if (inString) {
      withoutComments += ch
      if (escaped) { escaped = false }
      else if (ch === '\\') { escaped = true }
      else if (ch === '"') { inString = false }
      continue
    }

    if (ch === '"') { inString = true; withoutComments += ch; continue }

    if (ch === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++
      if (i < content.length) withoutComments += '\n'
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) {
        if (content[i] === '\n') withoutComments += '\n'
        i++
      }
      i++
      continue
    }

    withoutComments += ch
  }

  let result = ''
  inString = false
  escaped = false

  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i]

    if (inString) {
      result += ch
      if (escaped) { escaped = false }
      else if (ch === '\\') { escaped = true }
      else if (ch === '"') { inString = false }
      continue
    }

    if (ch === '"') { inString = true; result += ch; continue }

    if (ch === ',') {
      let j = i + 1
      while (j < withoutComments.length && /\s/.test(withoutComments[j])) j++
      if (withoutComments[j] === '}' || withoutComments[j] === ']') continue
    }

    result += ch
  }

  return result
}