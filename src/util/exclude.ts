function matchesGlob(filePath: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '(.+)')
        .replace(/(?<!\()\*/g, '[^/]+') +
      '$',
  )
  return regex.test(filePath)
}

export function isExcluded(filePath: string, exclude: string[]): boolean {
  return exclude.some(pattern => matchesGlob(filePath, pattern))
}
