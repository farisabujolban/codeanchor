import type { ScanResult, Finding } from './types.js'

export function printResult(result: ScanResult): void {
  if (result.findings.length === 0) {
    console.log('No issues found.')
    return
  }

  for (const f of result.findings) {
    const loc = f.line != null ? `${f.file}:${f.line}` : f.file
    console.log(`\n  ${f.ruleId}  ${f.severity}  ${loc}`)
    console.log(`  ${f.message}`)
    if (f.detail) console.log(`  ${f.detail}`)
    if (f.fix) console.log(`  → ${f.fix}`)
  }

  const parts: string[] = []
  if (result.errorCount > 0) {
    parts.push(`${result.errorCount} error${result.errorCount !== 1 ? 's' : ''}`)
  }
  if (result.warnCount > 0) {
    parts.push(`${result.warnCount} warning${result.warnCount !== 1 ? 's' : ''}`)
  }
  if (parts.length > 0) {
    console.log(`\n  ${parts.join(', ')}`)
  }

  if (result.errorCount > 0) {
    console.log('\n  Run failed.')
  }
}

export function renderMarkdown(result: ScanResult): string {
  const date = result.timestamp.slice(0, 10)
  const lines: string[] = [
    `# codeanchor Report`,
    ``,
    `**Mode:** ${result.mode} | **Date:** ${date} | **Errors:** ${result.errorCount} | **Warnings:** ${result.warnCount}`,
    ``,
  ]

  const errors = result.findings.filter(f => f.severity === 'error')
  const warnings = result.findings.filter(f => f.severity === 'warn')

  if (errors.length > 0) {
    lines.push(`## Errors`, ``)
    for (const f of errors) lines.push(...findingToMarkdown(f))
  }

  if (warnings.length > 0) {
    lines.push(`## Warnings`, ``)
    for (const f of warnings) lines.push(...findingToMarkdown(f))
  }

  if (result.findings.length === 0) {
    lines.push(`No issues found.`)
  }

  return lines.join('\n') + '\n'
}

function findingToMarkdown(f: Finding): string[] {
  const loc = f.line != null ? `${f.file}:${f.line}` : f.file
  const out = [
    `### ${f.ruleId}`,
    `**File:** \`${loc}\``,
    f.message,
  ]
  if (f.detail) out.push(f.detail)
  if (f.fix) out.push(`**Fix:** \`${f.fix}\``)
  out.push(``, `---`, ``)
  return out
}
