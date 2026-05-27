import { execFileSync } from 'node:child_process'

export interface HotFile {
  path: string
  commitCount: number
}

export function parseSinceDuration(since: string): string {
  const m = since.match(/^(\d+)([dmy])$/)
  if (!m) return since
  const n = parseInt(m[1], 10)
  const unit = { d: 'day', m: 'month', y: 'year' }[m[2]] as string
  return `${n} ${unit}${n !== 1 ? 's' : ''} ago`
}

export function getHotFiles(
  repoRoot: string,
  since: string,
  minCommits: number = 3,
): HotFile[] {
  const dateStr = parseSinceDuration(since)
  let raw: string
  try {
    raw = execFileSync('git', ['log', `--since=${dateStr}`, '--name-only', '--format='], {
      encoding: 'utf-8',
      cwd: repoRoot,
    })
  } catch {
    return []
  }

  const counts = new Map<string, number>()
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
  }

  const results: HotFile[] = []
  for (const [filePath, count] of counts) {
    if (count >= minCommits) {
      results.push({ path: filePath, commitCount: count })
    }
  }
  return results.sort((a, b) => b.commitCount - a.commitCount)
}

export function getFileCommitCount(
  repoRoot: string,
  filePath: string,
  since: string,
): number {
  const dateStr = parseSinceDuration(since)
  try {
    const out = execFileSync(
      'git', ['log', `--since=${dateStr}`, '--oneline', '--', filePath],
      { encoding: 'utf-8', cwd: repoRoot },
    )
    return out.trim().split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}
