import { Command } from 'commander'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { getStagedDiff, getPrDiff, parseDiff } from './git/diff.js'
import { runEngine } from './engine.js'
import { printResult, renderMarkdown } from './reporter.js'
import { getDriver } from './util/languages.js'
import { findCommentAtLine } from './util/comment-parser.js'
import { getOwnedRegion } from './util/ownership.js'
import { loadApprovals, buildApproval, upsertApproval, saveApprovals } from './util/approvals.js'
import { allRules } from './rules/index.js'

const program = new Command()

program
  .name('codeanchor')
  .description('Deterministic tech-debt and workflow-drift CLI')
  .version('0.1.0')

program
  .command('scan')
  .description('Scan for repo drift issues')
  .option('--staged', 'Check only staged changes (pre-commit mode)')
  .option('--repo', 'Check current repo state')
  .option('--base <ref>', 'Base ref for PR diff')
  .option('--head <ref>', 'Head ref for PR diff')
  .option('--history', 'Enable history-based rules')
  .option('--since <duration>', 'Window for history mode (e.g. 90d, 6m)')
  .option('--rules <ids>', 'Comma-separated rule IDs to run')
  .option('--json [path]', 'Write JSON output (stdout if no path given)')
  .option('--markdown [path]', 'Write Markdown report (stdout if no path given)')
  .option('--fail-on-warn', 'Exit 1 even for warnings')
  .option('--no-color', 'Disable color output')
  .action(async (opts) => {
    const cwd = process.cwd()
    const config = loadConfig(cwd)

    let ruleIds: string[] | undefined
    if (opts.rules) {
      ruleIds = (opts.rules as string).split(',').map((s: string) => s.trim()).filter(Boolean)
      const unknown = ruleIds.filter(id => !allRules.some(r => r.id === id))
      if (unknown.length > 0) {
        console.error(`Unknown rule IDs: ${unknown.join(', ')}`)
        console.error(`Valid IDs: ${allRules.map(r => r.id).join(', ')}`)
        process.exit(2)
      }
    }

    let mode: 'staged' | 'repo' | 'pr' | 'history' = 'repo'
    let stagedDiffs = undefined

    if (opts.staged) {
      mode = 'staged'
      const rawDiff = getStagedDiff()
      if (!rawDiff.trim()) {
        console.log('No staged changes.')
        process.exit(0)
      }
      stagedDiffs = parseDiff(rawDiff)
    } else if (opts.base && opts.head) {
      mode = 'pr'
      const rawDiff = getPrDiff(opts.base, opts.head)
      if (rawDiff.trim()) {
        stagedDiffs = parseDiff(rawDiff)
      }
    } else if (opts.history) {
      mode = 'history'
    }

    const result = await runEngine({
      mode,
      repoRoot: cwd,
      config,
      stagedDiffs,
      since: opts.since,
      ruleIds,
    })

    const shouldFail = result.errorCount > 0 || (opts.failOnWarn && result.warnCount > 0)

    if (opts.json !== undefined) {
      const ruleBreakdown: Record<string, number> = {}
      for (const f of result.findings) {
        ruleBreakdown[f.ruleId] = (ruleBreakdown[f.ruleId] ?? 0) + 1
      }
      const jsonOutput = {
        version: '1',
        mode: result.mode,
        timestamp: result.timestamp,
        repoRoot: result.repoRoot,
        summary: {
          errorCount: result.errorCount,
          warnCount: result.warnCount,
          ruleBreakdown,
        },
        findings: result.findings,
      }
      const json = JSON.stringify(jsonOutput, null, 2) + '\n'
      if (typeof opts.json === 'string') {
        fs.writeFileSync(opts.json, json, 'utf-8')
      } else {
        process.stdout.write(json)
      }
      if (shouldFail) process.exit(1)
      return
    }

    if (opts.markdown !== undefined) {
      const md = renderMarkdown(result)
      if (typeof opts.markdown === 'string') {
        fs.writeFileSync(opts.markdown, md, 'utf-8')
      } else {
        process.stdout.write(md)
      }
      if (shouldFail) process.exit(1)
      return
    }

    printResult(result)

    if (shouldFail) {
      process.exit(1)
    }
  })

program
  .command('approve <file> <line>')
  .description('Mark a stale comment as intentionally reviewed')
  .action((file: string, lineStr: string) => {
    const cwd = process.cwd()
    const line = parseInt(lineStr, 10)
    if (isNaN(line)) {
      console.error(`Invalid line number: ${lineStr}`)
      process.exit(2)
    }

    const driver = getDriver(file)
    if (!driver) {
      console.error(`Unsupported file type: ${file}`)
      process.exit(2)
    }

    const absPath = path.resolve(cwd, file)
    let content: string
    try {
      content = fs.readFileSync(absPath, 'utf-8')
    } catch {
      console.error(`Cannot read file: ${file}`)
      process.exit(2)
    }

    const comment = findCommentAtLine(content, line, driver)
    if (!comment) {
      console.error(`No leading comment found at line ${line} in ${file}`)
      process.exit(2)
    }

    const config = loadConfig(cwd)
    const ruleCfg = config.rules['CA-CD001']
    const maxDist =
      typeof ruleCfg === 'object' && ruleCfg?.maxOwnershipDistance
        ? ruleCfg.maxOwnershipDistance
        : 20

    const lines = content.split('\n')
    const region = getOwnedRegion(comment, lines, maxDist, driver)
    if (!region) {
      console.error(`Could not determine owned region for comment at ${file}:${line}`)
      process.exit(2)
    }

    const store = loadApprovals(cwd)
    const approval = buildApproval(file, comment, lines, region, cwd)
    upsertApproval(store, approval)
    saveApprovals(store, cwd)
    console.log(`Approved ${file}:${line}`)
  })

program
  .command('rules')
  .description('List all rules with ID, description, mode, and default severity')
  .action(() => {
    console.log('\nAvailable rules:\n')
    for (const rule of allRules) {
      const modes = rule.applicableModes.join(', ')
      console.log(`  ${rule.id}  [${rule.defaultSeverity}]  modes: ${modes}`)
      console.log(`  ${rule.description}\n`)
    }
  })

program.parse()
