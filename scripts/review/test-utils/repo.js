const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveGit } = require('../review-lib');

// Git hooks (pre-push runs the tests) export GIT_* variables such as GIT_DIR,
// which would point every temp-repo command, including git init, at the real
// repository. Jest gives each test file its own copy of process.env, so the
// cleaned copy must be passed to child processes explicitly; review-lib does
// that by passing env: process.env.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('GIT_')) {
    delete process.env[key];
  }
}

const GIT_CONFIG = [
  '-c',
  'user.name=Review Test',
  '-c',
  'user.email=review@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'init.defaultBranch=main',
  '-c',
  'core.hooksPath=/dev/null',
];

const CRITERIA_FIXTURES = {
  'docs/review/alpha.md': [
    '# Alpha (ALP)',
    '',
    '**Review kinds:** pr, repo',
    '',
    '## Criteria',
    '',
    '- **ALP-01** (MUST) First rule. Verify: read it.',
    '- **ALP-02** (SHOULD) Second rule. Verify: read it.',
    '',
  ].join('\n'),
  'docs/review/hygiene.md': [
    '# Hygiene (HYG)',
    '',
    '**Review kinds:** pr',
    '',
    '- **HYG-01** (SHOULD) PR-only rule. Verify: read it.',
    '',
  ].join('\n'),
  'docs/review/LEDGER.md': '# Not criteria\n\n- **NOPE-01** (MUST) Ignored.\n',
};

const createTempRepo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-test-'));
  const git = (...args) =>
    execFileSync(resolveGit(), [...GIT_CONFIG, ...args], {
      cwd: dir,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const write = (relativePath, content) => {
    const absolute = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  };
  const read = (relativePath) =>
    fs.readFileSync(path.join(dir, relativePath), 'utf8');
  const commit = (message) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD').trim();
  };
  const remove = () => fs.rmSync(dir, { recursive: true, force: true });

  git('init', '-q');
  const gitDir = fs.realpathSync(git('rev-parse', '--absolute-git-dir').trim());
  if (!gitDir.startsWith(`${fs.realpathSync(dir)}${path.sep}`)) {
    throw new Error(
      `Temp repo resolved to ${gitDir}; refusing to run git against another repository.`,
    );
  }
  return { dir, git, write, read, commit, remove };
};

const lines = (count, prefix = 'line') =>
  `${Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`).join('\n')}\n`;

const completeLedger = (ledger) => {
  for (const file of ledger.files) {
    file.status = 'reviewed';
    file.linesRead = file.lineCount > 0 ? [[1, file.lineCount]] : [];
    file.evidence = `Read every line of ${file.path} and searched its callers.`;
  }
  for (const row of ledger.criteria) {
    row.status = 'pass';
    row.evidence = 'Checked `rg -n pattern` and src/a.ts:1 for this rule.';
  }
  for (const gate of ledger.gates) {
    gate.status = 'passed';
    gate.exitCode = 0;
    gate.evidence = 'exit 0, no output';
  }
  ledger.verification = {
    verifierRan: true,
    findingsChecked: 0,
    passesSampled: 3,
    notes: 'Sampled passes held.',
  };
  ledger.verdict = 'approve';
  return ledger;
};

const addFinding = (ledger, overrides = {}) => {
  const finding = {
    id: `F-${ledger.findings.length + 1}`,
    severity: 'SHOULD',
    confidence: 0.9,
    location: 'src/a.ts:10',
    criteria: ['ALP-01'],
    title: 'Fix the thing',
    detail: 'When the input is empty the function throws and the page breaks.',
    evidence: 'Read src/a.ts:10 and searched callers with rg.',
    verification: 'verified',
    preExisting: false,
    ...overrides,
  };
  ledger.findings.push(finding);
  for (const id of finding.criteria) {
    const row = ledger.criteria.find((item) => item.id === id);
    if (row) {
      row.status = 'finding';
      row.findings.push(finding.id);
    }
  }
  return finding;
};

module.exports = {
  CRITERIA_FIXTURES,
  addFinding,
  completeLedger,
  createTempRepo,
  lines,
};
