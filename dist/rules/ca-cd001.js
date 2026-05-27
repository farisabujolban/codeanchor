import fs from 'node:fs';
import path from 'node:path';
import { getDriver } from '../util/languages.js';
import { extractLeadingComments } from '../util/comment-parser.js';
import { shouldIgnoreComment } from '../util/ignore-rules.js';
import { getOwnedRegion } from '../util/ownership.js';
import { loadApprovals, findApproval, isApprovalValid } from '../util/approvals.js';
import { diffTouchesRange } from '../git/diff.js';
import { isExcluded } from '../util/exclude.js';
export const caCd001 = {
    id: 'CA-CD001',
    description: 'Code changed but leading comment was not updated.',
    defaultSeverity: 'error',
    applicableModes: ['staged'],
    async run(ctx) {
        const { stagedDiffs, repoRoot, config } = ctx;
        if (!stagedDiffs)
            return [];
        const ruleCfg = config.rules['CA-CD001'];
        if (ruleCfg === false)
            return [];
        const maxOwnershipDistance = typeof ruleCfg === 'object' && ruleCfg?.maxOwnershipDistance
            ? ruleCfg.maxOwnershipDistance
            : 20;
        const findings = [];
        const approvalsStore = loadApprovals(repoRoot);
        for (const fileDiff of stagedDiffs) {
            if (fileDiff.status === 'deleted')
                continue;
            if (fileDiff.status === 'added')
                continue;
            const driver = getDriver(fileDiff.path);
            if (!driver)
                continue;
            if (isExcluded(fileDiff.path, config.exclude))
                continue;
            const absPath = path.join(repoRoot, fileDiff.path);
            if (!fs.existsSync(absPath))
                continue;
            let content;
            try {
                content = fs.readFileSync(absPath, 'utf-8');
            }
            catch {
                continue;
            }
            const lines = content.split('\n');
            const comments = extractLeadingComments(content, driver);
            for (const comment of comments) {
                if (shouldIgnoreComment(comment, driver))
                    continue;
                const region = getOwnedRegion(comment, lines, maxOwnershipDistance, driver);
                if (!region)
                    continue;
                const codeChanged = diffTouchesRange(fileDiff, region.startLine, region.endLine);
                if (!codeChanged)
                    continue;
                const commentChanged = diffTouchesRange(fileDiff, comment.startLine, comment.endLine);
                if (commentChanged)
                    continue;
                const approval = findApproval(approvalsStore, fileDiff.path, comment.startLine);
                if (approval && isApprovalValid(approval, comment, lines, region))
                    continue;
                const changedInRegion = [];
                for (let l = region.startLine; l <= region.endLine; l++) {
                    if (fileDiff.changedLines.has(l))
                        changedInRegion.push(l);
                }
                const rangeStr = changedInRegion.length === 1
                    ? `${changedInRegion[0]}`
                    : `${changedInRegion[0]}–${changedInRegion[changedInRegion.length - 1]}`;
                findings.push({
                    ruleId: 'CA-CD001',
                    severity: 'error',
                    file: fileDiff.path,
                    line: comment.startLine,
                    message: `Code changed at lines ${rangeStr} but leading comment was not updated.`,
                    fix: `codeanchor approve ${fileDiff.path} ${comment.startLine}`,
                });
            }
        }
        return findings;
    },
};
