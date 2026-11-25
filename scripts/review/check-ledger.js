#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const {
  checkLedger,
  collectInventory,
  createGit,
  parseCriteria,
  readWorktreeFileFrom,
  summarizeLedger,
} = require('./review-lib');

const USAGE = 'Usage: node scripts/review/check-ledger.js <ledger.json>';

const formatCounts = (counts) =>
  Object.entries(counts)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ') || 'none';

const main = (argv, deps = {}) => {
  const cwd = deps.cwd || process.cwd();
  const git = deps.git || createGit(cwd);
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || ((text) => process.stdout.write(`${text}\n`));
  const stderr = deps.stderr || ((text) => process.stderr.write(`${text}\n`));

  if (argv.length !== 1 || argv[0].startsWith('--')) {
    stderr(USAGE);
    return 2;
  }

  const ledgerPath = path.resolve(cwd, argv[0]);
  let ledger;
  try {
    ledger = JSON.parse(fsImpl.readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    stderr(`Could not read ${argv[0]}: ${error.message}`);
    return 1;
  }

  const { criteria, errors: criteriaErrors } = parseCriteria({
    docsDir: path.join(cwd, 'docs', 'review'),
    listDir: (dir) => fsImpl.readdirSync(dir),
    readText: (filePath) => fsImpl.readFileSync(filePath, 'utf8'),
  });
  if (criteriaErrors.length > 0) {
    stderr(
      `Criteria files have problems:\n${criteriaErrors.map((e) => `  - ${e}`).join('\n')}`,
    );
    return 1;
  }

  let mergeBaseOmission = '';
  if (ledger.kind === 'pr' && ledger.base) {
    let headCommit = '';
    let baseCommit = '';
    try {
      headCommit = git(['rev-parse', 'HEAD']).trim();
      baseCommit = git(['rev-parse', ledger.base]).trim();
    } catch (error) {
      stderr(`Could not resolve the ledger base: ${error.message}`);
      return 1;
    }
    if (baseCommit === headCommit) {
      stderr(
        'PR ledger base resolves to HEAD, so the checker would see an empty diff.',
      );
      return 1;
    }
    try {
      const honest = collectInventory({
        kind: 'pr',
        base: ledger.base,
        baseSha: null,
        worktree: ledger.worktree === true,
        git,
        readWorktreeFile: deps.readWorktreeFile || readWorktreeFileFrom(cwd),
      });
      const covered = new Set((ledger.files || []).map((file) => file.path));
      const missing = honest.files.filter((file) => !covered.has(file.path));
      if (missing.length > 0) {
        mergeBaseOmission = `Ledger omits files from the merge-base diff: ${missing
          .map((file) => file.path)
          .join(', ')}`;
      }
    } catch (error) {
      stderr(`Could not rebuild the merge-base diff: ${error.message}`);
      return 1;
    }
  }

  let inventory;
  let headSha;
  try {
    headSha = git(['rev-parse', 'HEAD']).trim();
    inventory = collectInventory({
      kind: ledger.kind,
      base: ledger.base,
      baseSha: ledger.baseSha,
      worktree: ledger.worktree === true,
      git,
      readWorktreeFile: deps.readWorktreeFile || readWorktreeFileFrom(cwd),
    });
  } catch (error) {
    stderr(`Could not rebuild the inventory: ${error.message}`);
    return 1;
  }

  const inventoryPaths = new Set(inventory.files.map((file) => file.path));
  const fileExists = (filePath) =>
    inventoryPaths.has(filePath) || fsImpl.existsSync(path.join(cwd, filePath));

  const errors = checkLedger({
    ledger,
    inventory,
    criteria,
    headSha,
    fileExists,
  });
  if (mergeBaseOmission) {
    errors.unshift(mergeBaseOmission);
  }
  const summary = summarizeLedger(ledger);

  stdout(`Ledger ${argv[0]}`);
  stdout(`  files:    ${formatCounts(summary.files)}`);
  stdout(`  criteria: ${formatCounts(summary.criteria)}`);
  stdout(`  gates:    ${formatCounts(summary.gates)}`);
  stdout(`  findings: ${formatCounts(summary.findings)}`);
  stdout(`  verdict:  ${summary.verdict}`);

  if (errors.length > 0) {
    stderr(`\n${errors.length} problem(s):`);
    for (const error of errors) {
      stderr(`  - ${error}`);
    }
    stderr(
      '\nThe review is not finished. Fix the ledger rows above and run the check again.',
    );
    return 1;
  }
  stdout('\nLedger is complete and consistent.');
  return 0;
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main };
