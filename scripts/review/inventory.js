#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const {
  collectInventory,
  createGit,
  createLedger,
  parseCriteria,
  readWorktreeFileFrom,
} = require('./review-lib');

const USAGE = `Usage: node scripts/review/inventory.js --kind pr|repo [options]

Options:
  --base <ref>     Base for PR reviews (default origin/main)
  --worktree       PR review includes uncommitted and untracked changes
  --init <path>    Write a ledger skeleton (all rows pending) to <path>
  --force          Overwrite an existing ledger
  --json           Print the inventory as JSON
  --help           Show this message`;

const parseArgs = (argv) => {
  const options = {
    kind: null,
    base: 'origin/main',
    worktree: false,
    init: null,
    force: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }
      index += 1;
      return value;
    };
    if (arg === '--kind') {
      options.kind = takeValue();
    } else if (arg === '--base') {
      options.base = takeValue();
    } else if (arg === '--init') {
      options.init = takeValue();
    } else if (arg === '--worktree') {
      options.worktree = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (!options.help && !['pr', 'repo'].includes(options.kind)) {
    throw new Error('--kind pr or --kind repo is required');
  }
  if (options.kind === 'repo' && options.worktree) {
    throw new Error('--worktree only applies to --kind pr');
  }
  return options;
};

const collectWarnings = ({ options, git, cwd, fsImpl, nodeVersion }) => {
  const warnings = [];
  const status = git(['status', '--porcelain']).trim();
  if (status !== '' && !options.worktree) {
    warnings.push(
      options.kind === 'pr'
        ? 'Working tree has uncommitted changes that this inventory ignores. Commit them or use --worktree.'
        : 'Working tree has uncommitted changes; the repo review reads files as they are on disk.',
    );
  }

  let hooksPath = '';
  try {
    hooksPath = git(['config', 'core.hooksPath']).trim();
  } catch {
    hooksPath = '';
  }
  if (hooksPath === '' || !fsImpl.existsSync(path.join(cwd, hooksPath))) {
    warnings.push('Husky hooks are not installed. Run npm run prepare.');
  }

  const nvmrcPath = path.join(cwd, '.nvmrc');
  if (fsImpl.existsSync(nvmrcPath)) {
    const wanted = fsImpl
      .readFileSync(nvmrcPath, 'utf8')
      .trim()
      .replace(/^v/, '');
    const actualMajor = nodeVersion.replace(/^v/, '').split('.')[0];
    if (wanted.split('.')[0] !== actualMajor) {
      warnings.push(
        `Node ${nodeVersion} does not match .nvmrc (${wanted}). Run nvm use before running gates.`,
      );
    }
  }
  return warnings;
};

const formatInventory = (inventory) => {
  const lines = [];
  const scope =
    inventory.kind === 'pr'
      ? `PR review: ${inventory.base} (${inventory.baseSha}) .. ${
          inventory.worktree ? 'working tree' : 'HEAD'
        } (${inventory.head})`
      : `Repo review at HEAD ${inventory.head}`;
  lines.push(scope);

  const byCategory = {};
  let totalLines = 0;
  let totalChunks = 0;
  for (const file of inventory.files) {
    byCategory[file.category] = (byCategory[file.category] || 0) + 1;
    totalLines += file.lineCount;
    totalChunks += file.chunks.length;
  }
  lines.push(
    `${inventory.files.length} files, ${totalLines} lines, ${totalChunks} chunks of at most 150 lines`,
  );
  lines.push(
    `By category: ${
      Object.entries(byCategory)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, count]) => `${category} ${count}`)
        .join(', ') || 'none'
    }`,
  );
  lines.push('');
  for (const file of inventory.files) {
    const renamed = file.oldPath ? ` (from ${file.oldPath})` : '';
    const coverage = file.lineCoverageRequired
      ? `${file.lineCount} lines, ${file.chunks.length} chunk(s)`
      : 'line coverage not required';
    lines.push(
      `${file.change.padEnd(7)} ${file.category.padEnd(9)} ${file.path}${renamed}  [${coverage}]`,
    );
  }
  return lines.join('\n');
};

const main = (argv, deps = {}) => {
  const cwd = deps.cwd || process.cwd();
  const git = deps.git || createGit(cwd);
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || ((text) => process.stdout.write(`${text}\n`));
  const stderr = deps.stderr || ((text) => process.stderr.write(`${text}\n`));
  const now = deps.now || (() => new Date().toISOString());
  const nodeVersion = deps.nodeVersion || process.version;

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    stdout(USAGE);
    return 0;
  }

  let inventory;
  try {
    inventory = collectInventory({
      kind: options.kind,
      base: options.base,
      worktree: options.worktree,
      git,
      readWorktreeFile: deps.readWorktreeFile || readWorktreeFileFrom(cwd),
    });
  } catch (error) {
    stderr(`Could not build the inventory: ${error.message}`);
    return 1;
  }

  for (const warning of collectWarnings({
    options,
    git,
    cwd,
    fsImpl,
    nodeVersion,
  })) {
    stderr(`warning: ${warning}`);
  }

  stdout(
    options.json
      ? JSON.stringify(inventory, null, 2)
      : formatInventory(inventory),
  );

  if (!options.init) {
    return 0;
  }

  const docsDir = path.join(cwd, 'docs', 'review');
  const { criteria, errors } = parseCriteria({
    docsDir,
    listDir: (dir) => fsImpl.readdirSync(dir),
    readText: (filePath) => fsImpl.readFileSync(filePath, 'utf8'),
  });
  if (errors.length > 0) {
    stderr(
      `Criteria files have problems:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
    return 1;
  }

  const ledgerPath = path.resolve(cwd, options.init);
  if (fsImpl.existsSync(ledgerPath) && !options.force) {
    stderr(
      `${options.init} already exists. Continue from it, or pass --force to start over.`,
    );
    return 1;
  }
  const ledger = createLedger({ inventory, criteria, now: now() });
  fsImpl.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fsImpl.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  stdout(
    `\nWrote ${options.init}: ${ledger.files.length} files, ${ledger.criteria.length} criteria, ${ledger.gates.length} gates, all pending.`,
  );
  return 0;
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { formatInventory, main, parseArgs };
