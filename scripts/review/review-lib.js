const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHUNK_SIZE = 150;
const MIN_EVIDENCE_LENGTH = 20;
const MIN_REASON_LENGTH = 15;
const LOW_CONFIDENCE = 0.7;

const FILE_STATUSES = ['reviewed', 'not-inspected'];
const CRITERION_STATUSES = [
  'pass',
  'finding',
  'not-applicable',
  'not-inspected',
];
const GATE_STATUSES = ['passed', 'failed', 'not-run'];
const SEVERITIES = ['MUST', 'SHOULD', 'NICE', 'VERIFY', 'OUT OF SCOPE'];
const VERDICTS = [
  'approve',
  'approve-with-should',
  'changes-required',
  'incomplete',
];
const REVIEW_KINDS = ['pr', 'repo'];
const UNCOVERED_CATEGORIES = ['binary', 'lockfile', 'generated'];

const REQUIRED_GATES = [
  {
    name: 'hooks',
    command: 'git config core.hooksPath && test -d .husky/_',
  },
  { name: 'lint', command: 'make lint && make lambda-lint' },
  {
    name: 'typecheck',
    command:
      'npx tsc --noEmit -p tsconfig.build.json && (cd lambda && npx tsc --noEmit -p tsconfig.json)',
  },
  {
    name: 'format',
    command: 'make format-check && make lambda-format-check',
  },
  {
    name: 'test',
    command: 'make test && make lambda-test && make porch-test',
  },
  {
    name: 'build',
    command: 'make build && make lambda-build',
  },
  {
    name: 'security',
    command:
      'npm audit --audit-level=high && (cd lambda && npm audit --audit-level=high)',
  },
];

const CRITERION_PATTERN =
  /^- \*\*([A-Z0-9]+)-(\d{2})\*\* \((MUST|SHOULD|NICE)\) (.+)$/;
const KINDS_PATTERN = /^\*\*Review kinds:\*\*\s*(.+)$/m;
const CRITERIA_FILE_PATTERN = /^[a-z0-9-]+\.md$/;
const LOCATION_PATTERN = /^([^\s:]+):(\d+)(?:-(\d+))?$/;
const FINDING_ID_PATTERN = /^F-\d+$/;
const EVIDENCE_REFERENCE_PATTERNS = [
  /`[^`]+`/,
  /[\w@.-]+(?:\/[\w@.-]+)*\.[A-Za-z0-9]+:\d+/,
  /[\w@.-]+\/[\w@./-]+:\d+/,
];

const findExecutable = (name, searchPath = process.env.PATH || '') => {
  for (const dir of new Set(searchPath.split(path.delimiter))) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Not in this directory; keep searching.
    }
  }
  return name;
};

let gitPath;

// Long PATHs (nvm adds an entry per shell) make every spawn's lookup slow, and
// reviews spawn git once per file, so resolve it once.
const resolveGit = () => {
  gitPath = gitPath || findExecutable('git');
  return gitPath;
};

const createGit =
  (cwd) =>
  (args, { encoding = 'utf8' } = {}) =>
    execFileSync(resolveGit(), args, {
      cwd,
      env: process.env,
      encoding: encoding === 'buffer' ? undefined : encoding,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

const parseNameStatus = (output) => {
  const tokens = output.split('\0').filter((token) => token !== '');
  const entries = [];
  let index = 0;
  while (index < tokens.length) {
    const status = tokens[index];
    const change = status.charAt(0);
    if (change === 'R' || change === 'C') {
      entries.push({
        change,
        oldPath: tokens[index + 1],
        path: tokens[index + 2],
      });
      index += 3;
    } else {
      entries.push({ change, oldPath: null, path: tokens[index + 1] });
      index += 2;
    }
  }
  return entries;
};

const isBinaryBuffer = (buffer) => buffer.subarray(0, 8000).includes(0);

const countLines = (buffer) => {
  if (buffer.length === 0) {
    return 0;
  }
  const lines = buffer.toString('utf8').split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length;
};

const buildChunks = (lineCount, size = CHUNK_SIZE) => {
  const chunks = [];
  for (let start = 1; start <= lineCount; start += size) {
    chunks.push([start, Math.min(start + size - 1, lineCount)]);
  }
  return chunks;
};

const classifyPath = (filePath) => {
  const baseName = path.posix.basename(filePath);
  if (baseName === 'package-lock.json') {
    return 'lockfile';
  }
  if (
    filePath === 'next-env.d.ts' ||
    filePath.endsWith('.pem') ||
    filePath.startsWith('certs/')
  ) {
    return 'generated';
  }
  if (filePath.startsWith('.github/')) {
    return 'workflow';
  }
  if (
    filePath.startsWith('cloudformation/') ||
    filePath.startsWith('lambda/cloudformation/')
  ) {
    return 'infra';
  }
  if (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) ||
    /^pi\/test_.*\.py$/.test(filePath) ||
    filePath.startsWith('test/') ||
    baseName.startsWith('jest.setup.')
  ) {
    return 'test';
  }
  if (/\.(md|mdc)$/.test(filePath)) {
    return 'doc';
  }
  if (
    filePath.startsWith('scripts/') ||
    filePath.startsWith('.husky/') ||
    /\.(sh|service)$/.test(filePath)
  ) {
    return 'script';
  }
  if (
    filePath.startsWith('src/') ||
    filePath.startsWith('lambda/src/') ||
    filePath.startsWith('pi/') ||
    filePath === 'Dockerfile' ||
    filePath === 'api.yaml'
  ) {
    return 'source';
  }
  return 'config';
};

const describeFile = ({ change, oldPath, path: filePath, content }) => {
  const binary = isBinaryBuffer(content);
  const category = binary ? 'binary' : classifyPath(filePath);
  const lineCount = binary ? 0 : countLines(content);
  const lineCoverageRequired = !UNCOVERED_CATEGORIES.includes(category);
  return {
    path: filePath,
    change,
    oldPath,
    category,
    lineCount,
    lineCoverageRequired,
    chunks: lineCoverageRequired ? buildChunks(lineCount) : [],
  };
};

const collectInventory = ({
  kind,
  base = 'origin/main',
  baseSha: providedBaseSha,
  worktree = false,
  git,
  readWorktreeFile,
}) => {
  if (!REVIEW_KINDS.includes(kind)) {
    throw new Error(`Unknown review kind "${kind}". Use pr or repo.`);
  }
  const head = git(['rev-parse', 'HEAD']).trim();
  const showFile = (ref, filePath) =>
    git(['show', `${ref}:${filePath}`], { encoding: 'buffer' });

  if (kind === 'repo') {
    const tracked = git(['ls-files', '-z'])
      .split('\0')
      .filter((filePath) => filePath !== '');
    const files = tracked.map((filePath) => {
      const content = readWorktreeFile(filePath) ?? showFile('HEAD', filePath);
      return describeFile({
        change: 'tracked',
        oldPath: null,
        path: filePath,
        content,
      });
    });
    return { kind, base: null, baseSha: null, head, worktree: false, files };
  }

  const baseSha = providedBaseSha || git(['merge-base', base, 'HEAD']).trim();
  const diffArgs = worktree
    ? ['diff', '--name-status', '-z', '-M', baseSha]
    : ['diff', '--name-status', '-z', '-M', baseSha, 'HEAD'];
  const entries = parseNameStatus(git(diffArgs));
  if (worktree) {
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter((filePath) => filePath !== '');
    for (const filePath of untracked) {
      entries.push({ change: 'A', oldPath: null, path: filePath });
    }
  }

  const files = entries.map((entry) => {
    let content;
    if (entry.change === 'D') {
      content = showFile(baseSha, entry.path);
    } else if (worktree) {
      content = readWorktreeFile(entry.path) ?? Buffer.alloc(0);
    } else {
      content = showFile('HEAD', entry.path);
    }
    return describeFile({ ...entry, content });
  });
  files.sort((a, b) => a.path.localeCompare(b.path));

  return { kind, base, baseSha, head, worktree, files };
};

const parseCriteria = ({ docsDir, listDir, readText }) => {
  const criteria = [];
  const errors = [];
  const seen = new Set();
  const fileNames = listDir(docsDir)
    .filter((name) => CRITERIA_FILE_PATTERN.test(name))
    .sort();

  for (const fileName of fileNames) {
    const text = readText(path.join(docsDir, fileName));
    const kindsMatch = text.match(KINDS_PATTERN);
    if (!kindsMatch) {
      errors.push(`${fileName}: missing "**Review kinds:**" line`);
      continue;
    }
    const kinds = kindsMatch[1]
      .split(',')
      .map((value) => value.trim().replace(/\.$/, ''))
      .filter(Boolean);
    const unknownKinds = kinds.filter((value) => !REVIEW_KINDS.includes(value));
    if (unknownKinds.length > 0) {
      errors.push(
        `${fileName}: unknown review kinds ${unknownKinds.join(', ')}`,
      );
    }

    const fileCriteria = [];
    for (const line of text.split('\n')) {
      const match = line.match(CRITERION_PATTERN);
      if (!match) {
        continue;
      }
      const [, area, number, severity, description] = match;
      const id = `${area}-${number}`;
      if (seen.has(id)) {
        errors.push(`${fileName}: duplicate criterion ${id}`);
        continue;
      }
      seen.add(id);
      fileCriteria.push({
        id,
        area,
        severity,
        kinds,
        file: fileName,
        description,
      });
    }

    if (fileCriteria.length === 0) {
      errors.push(`${fileName}: no criteria found`);
    }
    const areas = new Set(fileCriteria.map((criterion) => criterion.area));
    if (areas.size > 1) {
      errors.push(
        `${fileName}: mixes criterion prefixes ${[...areas].join(', ')}`,
      );
    }
    criteria.push(...fileCriteria);
  }

  return { criteria, errors };
};

const createLedger = ({ inventory, criteria, now }) => ({
  version: 1,
  kind: inventory.kind,
  base: inventory.base,
  baseSha: inventory.baseSha,
  head: inventory.head,
  worktree: inventory.worktree,
  createdAt: now,
  files: inventory.files.map((file) => ({
    ...file,
    status: 'pending',
    linesRead: [],
    evidence: '',
    reason: '',
  })),
  criteria: criteria
    .filter((criterion) => criterion.kinds.includes(inventory.kind))
    .map((criterion) => ({
      id: criterion.id,
      area: criterion.area,
      severity: criterion.severity,
      status: 'pending',
      evidence: '',
      reason: '',
      findings: [],
    })),
  gates: REQUIRED_GATES.map((gate) => ({
    ...gate,
    status: 'pending',
    exitCode: null,
    evidence: '',
  })),
  findings: [],
  verification: {
    verifierRan: false,
    findingsChecked: 0,
    passesSampled: 0,
    notes: '',
  },
  verdict: 'pending',
});

const coversAllLines = (ranges, lineCount) => {
  if (lineCount === 0) {
    return true;
  }
  if (!Array.isArray(ranges)) {
    return false;
  }
  const valid = ranges.filter(
    (range) =>
      Array.isArray(range) &&
      range.length === 2 &&
      Number.isInteger(range[0]) &&
      Number.isInteger(range[1]) &&
      range[0] >= 1 &&
      range[1] >= range[0],
  );
  if (valid.length !== ranges.length) {
    return false;
  }
  const sorted = [...valid].sort((a, b) => a[0] - b[0]);
  let covered = 0;
  for (const [start, end] of sorted) {
    if (start > covered + 1) {
      return false;
    }
    covered = Math.max(covered, end);
  }
  return covered >= lineCount;
};

const hasText = (value, minimum) =>
  typeof value === 'string' && value.trim().length >= minimum;

const citesReference = (value) =>
  typeof value === 'string' &&
  EVIDENCE_REFERENCE_PATTERNS.some((pattern) => pattern.test(value));

const checkFiles = (ledger, inventory, errors) => {
  const expected = new Map(inventory.files.map((file) => [file.path, file]));
  const seen = new Set();

  for (const file of ledger.files) {
    const label = `file ${file.path}`;
    if (seen.has(file.path)) {
      errors.push(`${label}: listed more than once`);
      continue;
    }
    seen.add(file.path);

    const current = expected.get(file.path);
    if (!current) {
      errors.push(
        `${label}: not in the current inventory (remove it or re-run inventory)`,
      );
      continue;
    }
    if (
      current.lineCount !== file.lineCount ||
      current.change !== file.change
    ) {
      errors.push(
        `${label}: changed since the inventory (now ${current.change}, ${current.lineCount} lines); review it again`,
      );
    }

    if (file.status === 'pending') {
      errors.push(`${label}: still pending`);
      continue;
    }
    if (!FILE_STATUSES.includes(file.status)) {
      errors.push(`${label}: invalid status "${file.status}"`);
      continue;
    }
    if (file.status === 'not-inspected') {
      if (!hasText(file.reason, MIN_REASON_LENGTH)) {
        errors.push(`${label}: not-inspected needs a specific reason`);
      }
      continue;
    }
    if (!hasText(file.evidence, MIN_EVIDENCE_LENGTH)) {
      errors.push(`${label}: reviewed needs evidence of what was checked`);
    }
    if (
      current.lineCoverageRequired &&
      !coversAllLines(file.linesRead, current.lineCount)
    ) {
      errors.push(
        `${label}: linesRead does not cover lines 1-${current.lineCount}`,
      );
    }
  }

  for (const filePath of expected.keys()) {
    if (!seen.has(filePath)) {
      errors.push(`file ${filePath}: in scope but missing from the ledger`);
    }
  }
};

const checkCriteria = (ledger, criteria, findingIds, errors) => {
  const expected = new Map(
    criteria
      .filter((criterion) => criterion.kinds.includes(ledger.kind))
      .map((criterion) => [criterion.id, criterion]),
  );
  const seen = new Set();

  for (const row of ledger.criteria) {
    const label = `criterion ${row.id}`;
    if (seen.has(row.id)) {
      errors.push(`${label}: listed more than once`);
      continue;
    }
    seen.add(row.id);
    if (!expected.has(row.id)) {
      errors.push(`${label}: not a ${ledger.kind} criterion in docs/review`);
      continue;
    }
    if (row.status === 'pending') {
      errors.push(`${label}: still pending`);
      continue;
    }
    if (!CRITERION_STATUSES.includes(row.status)) {
      errors.push(`${label}: invalid status "${row.status}"`);
      continue;
    }
    if (row.status === 'pass' || row.status === 'finding') {
      if (
        !hasText(row.evidence, MIN_EVIDENCE_LENGTH) ||
        !citesReference(row.evidence)
      ) {
        errors.push(
          `${label}: ${row.status} needs evidence citing a path:line or a backticked command`,
        );
      }
    } else if (!hasText(row.reason, MIN_REASON_LENGTH)) {
      errors.push(`${label}: ${row.status} needs a specific reason`);
    }

    const linked = Array.isArray(row.findings) ? row.findings : [];
    if (row.status === 'finding' && linked.length === 0) {
      errors.push(`${label}: status finding but no finding IDs listed`);
    }
    if (row.status !== 'finding' && linked.length > 0) {
      errors.push(`${label}: lists findings but status is ${row.status}`);
    }
    for (const findingId of linked) {
      if (!findingIds.has(findingId)) {
        errors.push(`${label}: references unknown finding ${findingId}`);
      }
    }
  }

  for (const id of expected.keys()) {
    if (!seen.has(id)) {
      errors.push(`criterion ${id}: missing from the ledger`);
    }
  }
};

const checkGates = (ledger, errors) => {
  const seen = new Set();
  for (const gate of ledger.gates) {
    const label = `gate ${gate.name}`;
    if (seen.has(gate.name)) {
      errors.push(`${label}: listed more than once`);
      continue;
    }
    seen.add(gate.name);
    if (gate.status === 'pending') {
      errors.push(`${label}: still pending`);
      continue;
    }
    if (!GATE_STATUSES.includes(gate.status)) {
      errors.push(`${label}: invalid status "${gate.status}"`);
      continue;
    }
    if (!hasText(gate.evidence, 5)) {
      errors.push(`${label}: needs evidence (output, or why it was not run)`);
    }
    if (gate.status === 'not-run') {
      continue;
    }
    if (!Number.isInteger(gate.exitCode)) {
      errors.push(`${label}: ${gate.status} needs an integer exitCode`);
    } else if (gate.status === 'passed' && gate.exitCode !== 0) {
      errors.push(`${label}: passed but exitCode is ${gate.exitCode}`);
    } else if (gate.status === 'failed' && gate.exitCode === 0) {
      errors.push(`${label}: failed but exitCode is 0`);
    }
  }
  for (const gate of REQUIRED_GATES) {
    if (!seen.has(gate.name)) {
      errors.push(`gate ${gate.name}: required gate missing`);
    }
  }
};

const checkFindings = (ledger, criteriaRows, fileExists, errors) => {
  const seen = new Set();
  for (const finding of ledger.findings) {
    const label = `finding ${finding.id}`;
    if (!FINDING_ID_PATTERN.test(finding.id || '')) {
      errors.push(`${label}: id must look like F-1`);
    }
    if (seen.has(finding.id)) {
      errors.push(`${label}: duplicate id`);
    }
    seen.add(finding.id);

    if (!SEVERITIES.includes(finding.severity)) {
      errors.push(`${label}: invalid severity "${finding.severity}"`);
    }
    const confidenceValid =
      typeof finding.confidence === 'number' &&
      finding.confidence >= 0 &&
      finding.confidence <= 1;
    if (!confidenceValid) {
      errors.push(`${label}: confidence must be a number from 0 to 1`);
    }

    const location = LOCATION_PATTERN.exec(finding.location || '');
    if (!location) {
      errors.push(`${label}: location must be path:line or path:start-end`);
    } else if (!fileExists(location[1])) {
      errors.push(`${label}: location path ${location[1]} does not exist`);
    }

    for (const field of ['title', 'detail', 'evidence']) {
      if (
        !hasText(finding[field], field === 'title' ? 5 : MIN_EVIDENCE_LENGTH)
      ) {
        errors.push(`${label}: ${field} is missing or too short`);
      }
    }
    if (!['verified', 'unverified'].includes(finding.verification)) {
      errors.push(`${label}: verification must be verified or unverified`);
    }
    if (typeof finding.preExisting !== 'boolean') {
      errors.push(`${label}: preExisting must be true or false`);
    }
    const unproven =
      finding.verification !== 'verified' ||
      (confidenceValid && finding.confidence < LOW_CONFIDENCE);
    if (unproven && finding.severity !== 'VERIFY') {
      errors.push(
        `${label}: unverified or confidence below ${LOW_CONFIDENCE} must be VERIFY`,
      );
    }

    const linkedCriteria = Array.isArray(finding.criteria)
      ? finding.criteria
      : [];
    if (linkedCriteria.length === 0) {
      errors.push(`${label}: must reference at least one criterion`);
    }
    for (const criterionId of linkedCriteria) {
      const row = criteriaRows.get(criterionId);
      if (!row) {
        errors.push(`${label}: references unknown criterion ${criterionId}`);
      } else if (!(row.findings || []).includes(finding.id)) {
        errors.push(`${label}: criterion ${criterionId} does not list it back`);
      }
    }
  }
};

const checkVerdict = (ledger, errors) => {
  const { verdict } = ledger;
  if (verdict === 'pending') {
    errors.push('verdict: still pending');
    return;
  }
  if (!VERDICTS.includes(verdict)) {
    errors.push(`verdict: invalid value "${verdict}"`);
    return;
  }

  const verification = ledger.verification || {};
  if (typeof verification.verifierRan !== 'boolean') {
    errors.push('verification: verifierRan must be true or false');
  }

  const incompleteReasons = [];
  if (ledger.files.some((file) => file.status === 'not-inspected')) {
    incompleteReasons.push('a file is not-inspected');
  }
  if (ledger.criteria.some((row) => row.status === 'not-inspected')) {
    incompleteReasons.push('a criterion is not-inspected');
  }
  if (ledger.gates.some((gate) => gate.status === 'not-run')) {
    incompleteReasons.push('a gate was not run');
  }
  if (verification.verifierRan !== true) {
    incompleteReasons.push('the verifier did not run');
  }
  if (verdict === 'incomplete') {
    return;
  }
  if (incompleteReasons.length > 0) {
    errors.push(
      `verdict: must be incomplete because ${incompleteReasons.join(', ')}`,
    );
    return;
  }

  const blocking =
    ledger.findings.some(
      (finding) =>
        finding.severity === 'MUST' &&
        (ledger.kind === 'repo' || finding.preExisting === false),
    ) || ledger.gates.some((gate) => gate.status === 'failed');
  const concerns = ledger.findings.some(
    (finding) =>
      finding.severity === 'SHOULD' ||
      finding.severity === 'VERIFY' ||
      finding.severity === 'MUST',
  );

  if (blocking && verdict !== 'changes-required') {
    errors.push(
      'verdict: must be changes-required (a MUST finding from this change or a failed gate)',
    );
  } else if (!blocking && verdict === 'changes-required') {
    errors.push(
      'verdict: changes-required needs a blocking MUST finding or failed gate',
    );
  } else if (!blocking && concerns && verdict === 'approve') {
    errors.push(
      'verdict: approve is not allowed with MUST, SHOULD, or VERIFY findings',
    );
  } else if (!blocking && !concerns && verdict === 'approve-with-should') {
    errors.push(
      'verdict: approve-with-should needs at least one SHOULD-level finding',
    );
  }
};

const checkLedger = ({ ledger, inventory, criteria, headSha, fileExists }) => {
  const errors = [];
  if (!ledger || typeof ledger !== 'object') {
    return ['ledger: not a JSON object'];
  }
  if (ledger.version !== 1) {
    errors.push('ledger: version must be 1');
  }
  if (!REVIEW_KINDS.includes(ledger.kind)) {
    errors.push('ledger: kind must be pr or repo');
  }
  for (const key of ['files', 'criteria', 'gates', 'findings']) {
    if (!Array.isArray(ledger[key])) {
      errors.push(`ledger: ${key} must be an array`);
    }
  }
  if (errors.length > 0) {
    return errors;
  }
  if (ledger.head !== headSha) {
    errors.push(
      `ledger: head ${ledger.head} is not the current HEAD ${headSha}; re-run inventory and review the new commits`,
    );
  }

  const findingIds = new Set(ledger.findings.map((finding) => finding.id));
  const criteriaRows = new Map(ledger.criteria.map((row) => [row.id, row]));

  checkFiles(ledger, inventory, errors);
  checkCriteria(ledger, criteria, findingIds, errors);
  checkGates(ledger, errors);
  checkFindings(ledger, criteriaRows, fileExists, errors);
  checkVerdict(ledger, errors);
  return errors;
};

const summarizeLedger = (ledger) => {
  const count = (items, key) =>
    items.reduce((totals, item) => {
      totals[item[key]] = (totals[item[key]] || 0) + 1;
      return totals;
    }, {});
  return {
    files: count(ledger.files || [], 'status'),
    criteria: count(ledger.criteria || [], 'status'),
    gates: count(ledger.gates || [], 'status'),
    findings: count(ledger.findings || [], 'severity'),
    verdict: ledger.verdict,
  };
};

const readWorktreeFileFrom = (cwd) => (filePath) => {
  const absolute = path.join(cwd, filePath);
  try {
    if (!fs.statSync(absolute).isFile()) {
      return null;
    }
    return fs.readFileSync(absolute);
  } catch {
    return null;
  }
};

module.exports = {
  CHUNK_SIZE,
  REQUIRED_GATES,
  SEVERITIES,
  buildChunks,
  checkLedger,
  classifyPath,
  collectInventory,
  countLines,
  coversAllLines,
  createGit,
  createLedger,
  findExecutable,
  isBinaryBuffer,
  parseCriteria,
  parseNameStatus,
  readWorktreeFileFrom,
  resolveGit,
  summarizeLedger,
};
