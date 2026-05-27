function isBlank(line) {
    return line.trim() === '';
}
function getIndentLevel(line) {
    let count = 0;
    for (const ch of line) {
        if (ch === ' ')
            count++;
        else if (ch === '\t')
            count += 2;
        else
            break;
    }
    return count;
}
function isClosingBrace(line) {
    const t = line.trim();
    return t === '}' || t === '};' || t === '})' || t === '});' || t === ')' || t === ');';
}
export function getOwnedRegion(comment, lines, maxDistance, driver) {
    const startIdx = comment.ownedCodeStartLine - 1;
    const commentIndent = getIndentLevel(lines[comment.startLine - 1] ?? '');
    const limit = Math.min(startIdx + maxDistance, lines.length);
    let endIdx = -1;
    for (let i = startIdx; i < limit; i++) {
        const line = lines[i];
        if (isBlank(line))
            continue;
        // Same-line block comment: ownedCodeStartLine == endLine means code starts on the closing line
        if (i === startIdx && comment.ownedCodeStartLine === comment.endLine) {
            endIdx = i;
            continue;
        }
        if (driver.isCommentLine(line))
            break;
        if (driver.commentStyle === 'cstyle' && isClosingBrace(line) && getIndentLevel(line) <= commentIndent)
            break;
        endIdx = i;
    }
    if (endIdx === -1)
        return null;
    return {
        startLine: startIdx + 1,
        endLine: endIdx + 1,
    };
}
export function extractRegionLines(lines, region) {
    return lines.slice(region.startLine - 1, region.endLine);
}
