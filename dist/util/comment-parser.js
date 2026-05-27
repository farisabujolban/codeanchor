export function extractLeadingComments(content, driver) {
    if (driver.commentStyle === 'python') {
        return extractPython(content, driver);
    }
    return extractCstyle(content, driver);
}
function extractCstyle(content, driver) {
    const rawLines = content.split('\n');
    const comments = [];
    let i = 0;
    while (i < rawLines.length) {
        const trimmed = rawLines[i].trim();
        if (trimmed.startsWith('//')) {
            const blockStart = i;
            while (i < rawLines.length && rawLines[i].trim().startsWith('//')) {
                i++;
            }
            const blockEnd = i - 1;
            let j = i;
            while (j < rawLines.length && rawLines[j].trim() === '')
                j++;
            if (j < rawLines.length && driver.isCodeLine(rawLines[j])) {
                const text = rawLines
                    .slice(blockStart, blockEnd + 1)
                    .map(l => l.trim())
                    .join('\n');
                comments.push({
                    type: 'line',
                    text,
                    startLine: blockStart + 1,
                    endLine: blockEnd + 1,
                    ownedCodeStartLine: blockEnd + 2,
                });
            }
        }
        else if (trimmed.startsWith('/*')) {
            const blockStart = i;
            let closingLine = -1;
            let trailingSameLine = '';
            for (let k = i; k < rawLines.length; k++) {
                const idx = rawLines[k].indexOf('*/');
                if (idx !== -1) {
                    closingLine = k;
                    trailingSameLine = rawLines[k].slice(idx + 2).trim();
                    break;
                }
            }
            if (closingLine === -1) {
                i++;
                continue;
            }
            const text = rawLines.slice(blockStart, closingLine + 1).map(l => l.trim()).join('\n');
            i = closingLine + 1;
            if (trailingSameLine.length > 0) {
                comments.push({
                    type: 'block',
                    text,
                    startLine: blockStart + 1,
                    endLine: closingLine + 1,
                    ownedCodeStartLine: closingLine + 1,
                });
            }
            else {
                let j = i;
                while (j < rawLines.length && rawLines[j].trim() === '')
                    j++;
                if (j < rawLines.length && driver.isCodeLine(rawLines[j])) {
                    comments.push({
                        type: 'block',
                        text,
                        startLine: blockStart + 1,
                        endLine: closingLine + 1,
                        ownedCodeStartLine: closingLine + 2,
                    });
                }
            }
        }
        else {
            i++;
        }
    }
    return comments;
}
function extractPython(content, driver) {
    const rawLines = content.split('\n');
    const comments = [];
    let i = 0;
    let prevNonBlankTrimmed = '';
    while (i < rawLines.length) {
        const trimmed = rawLines[i].trim();
        if (trimmed === '') {
            i++;
            continue;
        }
        if (trimmed.startsWith('#')) {
            const blockStart = i;
            while (i < rawLines.length && rawLines[i].trim().startsWith('#')) {
                i++;
            }
            const blockEnd = i - 1;
            let j = i;
            while (j < rawLines.length && rawLines[j].trim() === '')
                j++;
            if (j < rawLines.length && driver.isCodeLine(rawLines[j])) {
                const text = rawLines
                    .slice(blockStart, blockEnd + 1)
                    .map(l => l.trim())
                    .join('\n');
                comments.push({
                    type: 'line',
                    text,
                    startLine: blockStart + 1,
                    endLine: blockEnd + 1,
                    ownedCodeStartLine: blockEnd + 2,
                });
            }
            prevNonBlankTrimmed = rawLines[blockEnd]?.trim() ?? '';
            continue;
        }
        // Detect docstrings: """ or ''' at the start of the trimmed line
        const tripleQuote = trimmed.startsWith('"""') ? '"""' :
            trimmed.startsWith("'''") ? "'''" :
                null;
        if (tripleQuote !== null) {
            const isDocstringContext = prevNonBlankTrimmed === '' || prevNonBlankTrimmed.endsWith(':');
            if (isDocstringContext) {
                const blockStart = i;
                let closingLine = -1;
                // Check if the docstring closes on the same line (after the opening triple quote)
                const restOfLine = trimmed.slice(3);
                if (restOfLine.includes(tripleQuote)) {
                    closingLine = i;
                }
                else {
                    for (let k = i + 1; k < rawLines.length; k++) {
                        if (rawLines[k].includes(tripleQuote)) {
                            closingLine = k;
                            break;
                        }
                    }
                }
                if (closingLine !== -1) {
                    const text = rawLines
                        .slice(blockStart, closingLine + 1)
                        .map(l => l.trim())
                        .join('\n');
                    i = closingLine + 1;
                    let j = i;
                    while (j < rawLines.length && rawLines[j].trim() === '')
                        j++;
                    if (j < rawLines.length && driver.isCodeLine(rawLines[j])) {
                        comments.push({
                            type: 'block',
                            text,
                            startLine: blockStart + 1,
                            endLine: closingLine + 1,
                            ownedCodeStartLine: closingLine + 2,
                        });
                    }
                    prevNonBlankTrimmed = rawLines[closingLine]?.trim() ?? '';
                    continue;
                }
            }
        }
        prevNonBlankTrimmed = trimmed;
        i++;
    }
    return comments;
}
export function findCommentAtLine(content, lineNumber, driver) {
    const comments = extractLeadingComments(content, driver);
    return comments.find(c => c.startLine === lineNumber) ?? null;
}
