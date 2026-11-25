#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { resolveGit } = require('./review-lib');

const CASES_PATH = path.join('evals', 'review', 'seeded-cases.json');
const SCORED_SEVERITIES = ['MUST', 'SHOULD', 'VERIFY'];
const PROTECTED_BRANCHES = ['main', 'master'];

const USAGE = `Usage: node scripts/review/eval-case.js <command>

Commands:
  list                      List seeded cases
  validate                  Check every case applies cleanly to the current tree
  apply <id> [--force]      Apply a case to the working tree (clean, non-main branch only)
  score <id> <ledger.json>  Score a review ledger against a case's expected findings`;

const resolveInsideRepo = (cwd, relativePath) => {
  if (
    typeof relativePath !== 'string' ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[/\\]/).includes('..')
  ) {
    throw new Error(`Refusing path outside the repository: ${relativePath}`);
  }
  const root = path.resolve(cwd);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing path outside the repository: ${relativePath}`);
  }
  return target;
};

const countOccurrences = (text, search) => {
  if (search === '') {
    return 0;
  }
  let count = 0;
  let index = text.indexOf(search);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(search, index + search.length);
  }
  return count;
};

const resolveEdits = (cases, id, trail = []) => {
  const found = cases.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Unknown case "${id}"`);
  }
  if (trail.includes(id)) {
    throw new Error(
      `Case "${id}" includes itself through ${trail.join(' -> ')}`,
    );
  }
  const included = (found.includes || []).flatMap((childId) =>
    resolveEdits(cases, childId, [...trail, id]),
  );
  return [...included, ...(found.edits || [])];
};

const resolveExpected = (cases, id) => {
  const found = cases.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Unknown case "${id}"`);
  }
  return [
    ...(found.includes || []).flatMap((childId) =>
      resolveExpected(cases, childId),
    ),
    ...(found.expected || []),
  ];
};

const applyEdits = (edits, readText) => {
  const files = new Map();
  const errors = [];
  for (const edit of edits) {
    if (!files.has(edit.path)) {
      const text = readText(edit.path);
      if (text === null) {
        errors.push(`${edit.path}: file does not exist`);
        continue;
      }
      files.set(edit.path, text);
    }
    const text = files.get(edit.path);
    const occurrences = countOccurrences(text, edit.find);
    if (occurrences !== 1) {
      errors.push(
        `${edit.path}: find text occurs ${occurrences} times (must be exactly once): ${JSON.stringify(
          edit.find.slice(0, 60),
        )}`,
      );
      continue;
    }
    files.set(
      edit.path,
      text.replace(edit.find, () => edit.replace),
    );
  }
  return { files, errors };
};

const validateCases = (data, readText) => {
  const errors = [];
  const ids = new Set();
  for (const item of data.cases) {
    if (ids.has(item.id)) {
      errors.push(`${item.id}: duplicate id`);
    }
    ids.add(item.id);
    if (!item.title || !item.summary) {
      errors.push(`${item.id}: needs a title and a summary`);
    }
    for (const expected of item.expected || []) {
      if (
        !expected.path ||
        !Array.isArray(expected.criteria) ||
        expected.criteria.length === 0
      ) {
        errors.push(
          `${item.id}: each expected entry needs a path and criteria`,
        );
      }
    }
  }
  for (const item of data.cases) {
    try {
      const edits = resolveEdits(data.cases, item.id);
      if (edits.length === 0) {
        errors.push(`${item.id}: has no edits`);
      }
      const result = applyEdits(edits, readText);
      errors.push(...result.errors.map((error) => `${item.id}: ${error}`));
    } catch (error) {
      errors.push(`${item.id}: ${error.message}`);
    }
  }
  return errors;
};

const findingPath = (finding) => String(finding.location || '').split(':')[0];

const scoreLedger = (expected, ledger) => {
  const findings = Array.isArray(ledger.findings) ? ledger.findings : [];
  const matched = new Set();
  const results = expected.map((item) => {
    const hit = findings.find(
      (finding) =>
        SCORED_SEVERITIES.includes(finding.severity) &&
        findingPath(finding) === item.path &&
        (finding.criteria || []).some((id) => item.criteria.includes(id)),
    );
    if (hit) {
      matched.add(hit.id);
    }
    return {
      label: item.label,
      path: item.path,
      criteria: item.criteria,
      found: Boolean(hit),
      findingId: hit ? hit.id : null,
      severity: hit ? hit.severity : null,
      severityMatches: hit
        ? !item.severity || hit.severity === item.severity
        : false,
    };
  });
  const unmatched = findings.filter((finding) => !matched.has(finding.id));
  const found = results.filter((result) => result.found).length;
  return {
    results,
    recall: expected.length === 0 ? null : found / expected.length,
    found,
    expected: expected.length,
    unmatched,
  };
};

const defaultGit = (cwd) => (args) =>
  execFileSync(resolveGit(), args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const main = (argv, deps = {}) => {
  const cwd = deps.cwd || process.cwd();
  const fsImpl = deps.fs || fs;
  const git = deps.git || defaultGit(cwd);
  const stdout = deps.stdout || ((text) => process.stdout.write(`${text}\n`));
  const stderr = deps.stderr || ((text) => process.stderr.write(`${text}\n`));
  const readText = (relativePath) => {
    const absolute = resolveInsideRepo(cwd, relativePath);
    return fsImpl.existsSync(absolute)
      ? fsImpl.readFileSync(absolute, 'utf8')
      : null;
  };

  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    (command ? stdout : stderr)(USAGE);
    return command ? 0 : 2;
  }

  let data;
  try {
    data = JSON.parse(readText(CASES_PATH));
  } catch (error) {
    stderr(`Could not read ${CASES_PATH}: ${error.message}`);
    return 1;
  }

  try {
    if (command === 'list') {
      for (const item of data.cases) {
        const expectedCount = resolveExpected(data.cases, item.id).length;
        stdout(
          `${item.id.padEnd(28)} ${expectedCount} expected  ${item.title}`,
        );
      }
      return 0;
    }

    if (command === 'validate') {
      const errors = validateCases(data, readText);
      if (errors.length > 0) {
        stderr(errors.map((error) => `  - ${error}`).join('\n'));
        stderr(
          `\n${errors.length} problem(s). Update the cases to match the current code.`,
        );
        return 1;
      }
      stdout(`All ${data.cases.length} cases apply cleanly.`);
      return 0;
    }

    if (command === 'apply') {
      const [id, flag] = rest;
      if (!id) {
        stderr(USAGE);
        return 2;
      }
      const force = flag === '--force';
      const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
      if (PROTECTED_BRANCHES.includes(branch)) {
        stderr(
          `Refusing to apply a seeded case on ${branch}. Create an eval branch first.`,
        );
        return 1;
      }
      if (!force && git(['status', '--porcelain']).trim() !== '') {
        stderr(
          'Working tree is not clean. Commit or stash first, or pass --force.',
        );
        return 1;
      }
      const { files, errors } = applyEdits(
        resolveEdits(data.cases, id),
        readText,
      );
      if (errors.length > 0) {
        stderr(errors.map((error) => `  - ${error}`).join('\n'));
        return 1;
      }
      for (const [relativePath, text] of files) {
        fsImpl.writeFileSync(resolveInsideRepo(cwd, relativePath), text);
      }
      stdout(
        `Applied ${id} to ${files.size} file(s). Commit it on this branch, then run pr-review against the parent commit.`,
      );
      return 0;
    }

    if (command === 'score') {
      const [id, ledgerPath] = rest;
      if (!id || !ledgerPath) {
        stderr(USAGE);
        return 2;
      }
      const ledger = JSON.parse(
        fsImpl.readFileSync(path.resolve(cwd, ledgerPath), 'utf8'),
      );
      const score = scoreLedger(resolveExpected(data.cases, id), ledger);
      for (const result of score.results) {
        const mark = result.found ? 'FOUND ' : 'MISSED';
        const detail = result.found
          ? ` (${result.findingId}, ${result.severity}${result.severityMatches ? '' : ', severity differs'})`
          : '';
        stdout(
          `${mark} ${result.label} [${result.path}; ${result.criteria.join(', ')}]${detail}`,
        );
      }
      stdout(
        `\nRecall: ${score.found}/${score.expected}${
          score.recall === null ? '' : ` (${Math.round(score.recall * 100)}%)`
        }`,
      );
      stdout(
        `Other findings to triage as true or false positives: ${score.unmatched.length}`,
      );
      for (const finding of score.unmatched) {
        stdout(
          `  ${finding.id} ${finding.severity} ${finding.location} ${finding.title}`,
        );
      }
      return 0;
    }
  } catch (error) {
    stderr(error.message);
    return 1;
  }

  stderr(`Unknown command ${command}\n\n${USAGE}`);
  return 2;
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  applyEdits,
  countOccurrences,
  main,
  resolveEdits,
  resolveExpected,
  scoreLedger,
  validateCases,
};
