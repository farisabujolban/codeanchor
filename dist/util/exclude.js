function matchesGlob(filePath, pattern) {
    const regex = new RegExp('^' +
        pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '(.+)')
            .replace(/(?<!\()\*/g, '[^/]+') +
        '$');
    return regex.test(filePath);
}
export function isExcluded(filePath, exclude) {
    return exclude.some(pattern => matchesGlob(filePath, pattern));
}
