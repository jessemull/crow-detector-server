/** @jest-environment node */
const fs = require('fs');
const path = require('path');

const {
  CRITERIA_FIXTURES,
  addFinding,
  completeLedger,
  createTempRepo,
  lines,
} = require('./test-utils/repo');
const {
  REQUIRED_GATES,
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
} = require('./review-lib');

const memoryCriteria = (files) => ({
  docsDir: 'docs/review',
  listDir: () => Object.keys(files),
  readText: (filePath) => files[path.basename(filePath)],
});

describe('findExecutable', () => {
  it('returns the first executable match on the search path, skipping empty and missing entries', () => {
    const repo = createTempRepo();
    try {
      repo.write('bin/tool', '#!/bin/sh\n');
      fs.chmodSync(path.join(repo.dir, 'bin/tool'), 0o755);
      repo.write('plain/tool', 'not executable\n');
      const searchPath = [
        '',
        path.join(repo.dir, 'missing'),
        path.join(repo.dir, 'plain'),
        path.join(repo.dir, 'bin'),
      ].join(path.delimiter);

      expect(findExecutable('tool', searchPath)).toBe(
        path.join(repo.dir, 'bin/tool'),
      );
      expect(findExecutable('no-such-tool', searchPath)).toBe('no-such-tool');
    } finally {
      repo.remove();
    }
  });

  it('resolves git once', () => {
    expect(path.basename(resolveGit())).toBe('git');
    expect(resolveGit()).toBe(resolveGit());
  });
});

describe('parseNameStatus', () => {
  it('parses NUL-separated modify, add, delete, rename, and copy entries', () => {
    const output = [
      'M',
      'src/a.ts',
      'A',
      'src/b.ts',
      'D',
      'src/c.ts',
      'R100',
      'src/old.ts',
      'src/new.ts',
      'C075',
      'src/base.ts',
      'src/copy.ts',
      '',
    ].join('\0');

    expect(parseNameStatus(output)).toEqual([
      { change: 'M', oldPath: null, path: 'src/a.ts' },
      { change: 'A', oldPath: null, path: 'src/b.ts' },
      { change: 'D', oldPath: null, path: 'src/c.ts' },
      { change: 'R', oldPath: 'src/old.ts', path: 'src/new.ts' },
      { change: 'C', oldPath: 'src/base.ts', path: 'src/copy.ts' },
    ]);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseNameStatus('')).toEqual([]);
  });
});

describe('file measurements', () => {
  it('counts lines with and without a trailing newline', () => {
    expect(countLines(Buffer.from(''))).toBe(0);
    expect(countLines(Buffer.from('one\ntwo\n'))).toBe(2);
    expect(countLines(Buffer.from('one\ntwo'))).toBe(2);
    expect(countLines(Buffer.from('\n'))).toBe(1);
  });

  it('detects binary content by a NUL byte', () => {
    expect(isBinaryBuffer(Buffer.from([0x89, 0x50, 0x00, 0x47]))).toBe(true);
    expect(isBinaryBuffer(Buffer.from('plain text'))).toBe(false);
  });

  it('plans chunks of at most 150 lines', () => {
    expect(buildChunks(0)).toEqual([]);
    expect(buildChunks(150)).toEqual([[1, 150]]);
    expect(buildChunks(151)).toEqual([
      [1, 150],
      [151, 151],
    ]);
    expect(buildChunks(10, 4)).toEqual([
      [1, 4],
      [5, 8],
      [9, 10],
    ]);
  });

  it.each([
    ['package-lock.json', 'lockfile'],
    ['next-env.d.ts', 'generated'],
    ['certs/rds-global-bundle.pem', 'generated'],
    ['.github/workflows/merge.yml', 'workflow'],
    ['cloudformation/stack.yml', 'infra'],
    ['src/auth/middleware/ecdsa-auth.guard.spec.ts', 'test'],
    ['pi/test_record_on_motion_lib.py', 'test'],
    ['test/setup.ts', 'test'],
    ['jest.setup.ts', 'test'],
    ['docs/REVIEW.md', 'doc'],
    ['.cursor/rules/000-context.mdc', 'doc'],
    ['scripts/deploy-porch-host.sh', 'script'],
    ['scripts/porch-recorder.service', 'script'],
    ['.husky/pre-push', 'script'],
    ['src/main.ts', 'source'],
    ['pi/record-on-motion.py', 'source'],
    ['Dockerfile', 'source'],
    ['api.yaml', 'source'],
    ['package.json', 'config'],
  ])('classifies %s as %s', (filePath, category) => {
    expect(classifyPath(filePath)).toBe(category);
  });
});

describe('coversAllLines', () => {
  it('accepts full coverage in any order, with overlaps', () => {
    expect(
      coversAllLines(
        [
          [100, 200],
          [1, 120],
        ],
        200,
      ),
    ).toBe(true);
  });

  it('accepts adjacent ranges', () => {
    expect(
      coversAllLines(
        [
          [1, 150],
          [151, 151],
        ],
        151,
      ),
    ).toBe(true);
  });

  it('rejects gaps, short coverage, and malformed ranges', () => {
    expect(
      coversAllLines(
        [
          [1, 10],
          [12, 20],
        ],
        20,
      ),
    ).toBe(false);
    expect(coversAllLines([[1, 19]], 20)).toBe(false);
    expect(coversAllLines([[0, 20]], 20)).toBe(false);
    expect(coversAllLines([[5, 1]], 5)).toBe(false);
    expect(coversAllLines([[1, '20']], 20)).toBe(false);
    expect(coversAllLines('1-20', 20)).toBe(false);
  });

  it('treats an empty file as covered', () => {
    expect(coversAllLines([], 0)).toBe(true);
  });
});

describe('parseCriteria', () => {
  it('reads criteria and review kinds, skipping uppercase files', () => {
    const { criteria, errors } = parseCriteria(
      memoryCriteria({
        'alpha.md': CRITERIA_FIXTURES['docs/review/alpha.md'],
        'hygiene.md': CRITERIA_FIXTURES['docs/review/hygiene.md'],
        'LEDGER.md': CRITERIA_FIXTURES['docs/review/LEDGER.md'],
      }),
    );

    expect(errors).toEqual([]);
    expect(criteria.map((criterion) => criterion.id)).toEqual([
      'ALP-01',
      'ALP-02',
      'HYG-01',
    ]);
    expect(criteria[0]).toMatchObject({
      area: 'ALP',
      severity: 'MUST',
      kinds: ['pr', 'repo'],
      file: 'alpha.md',
    });
    expect(criteria[2].kinds).toEqual(['pr']);
  });

  it('reports files without review kinds, unknown kinds, duplicates, mixed prefixes, and empty files', () => {
    const { errors } = parseCriteria(
      memoryCriteria({
        'a.md': '- **AAA-01** (MUST) No kinds line.\n',
        'b.md': '**Review kinds:** pr, nightly\n\n- **BBB-01** (MUST) Rule.\n',
        'c.md':
          '**Review kinds:** pr\n\n- **BBB-01** (SHOULD) Duplicate.\n- **CCC-01** (NICE) Other.\n',
        'd.md': '**Review kinds:** repo\n\nNo criteria here.\n',
      }),
    );

    expect(errors).toEqual([
      'a.md: missing "**Review kinds:**" line',
      'b.md: unknown review kinds nightly',
      'c.md: duplicate criterion BBB-01',
      'd.md: no criteria found',
    ]);

    const mixed = parseCriteria(
      memoryCriteria({
        'e.md':
          '**Review kinds:** pr\n\n- **EEE-01** (MUST) One.\n- **FFF-01** (MUST) Two.\n',
      }),
    );
    expect(mixed.errors).toEqual(['e.md: mixes criterion prefixes EEE, FFF']);
  });

  it('parses the real docs/review criteria without errors', () => {
    const docsDir = path.join(__dirname, '..', '..', 'docs', 'review');
    const { criteria, errors } = parseCriteria({
      docsDir,
      listDir: (dir) => fs.readdirSync(dir),
      readText: (filePath) => fs.readFileSync(filePath, 'utf8'),
    });

    expect(errors).toEqual([]);
    const files = new Set(criteria.map((criterion) => criterion.file));
    expect(files.size).toBeGreaterThanOrEqual(23);
    expect(
      criteria
        .filter((criterion) => criterion.area === 'PR')
        .every((criterion) => criterion.kinds.join() === 'pr'),
    ).toBe(true);
    expect(
      criteria.filter((criterion) => criterion.kinds.includes('repo')).length,
    ).toBeGreaterThan(200);
  });
});

describe('collectInventory', () => {
  let repo;

  beforeEach(() => {
    repo = createTempRepo();
    repo.write('src/keep.ts', lines(10));
    repo.write('src/edit.ts', lines(5));
    repo.write('src/gone.ts', lines(3));
    repo.write('src/old-name.ts', lines(40, 'rename'));
    repo.write('package-lock.json', '{}\n');
    repo.commit('base');
    repo.git('branch', 'base');
  });

  afterEach(() => repo.remove());

  const inventoryFor = (options) =>
    collectInventory({
      git: createGit(repo.dir),
      readWorktreeFile: readWorktreeFileFrom(repo.dir),
      ...options,
    });

  it('lists committed changes against the merge base, with deleted files measured at base', () => {
    repo.write('src/edit.ts', lines(200));
    repo.git('rm', '-q', 'src/gone.ts');
    repo.git('mv', 'src/old-name.ts', 'src/new-name.ts');
    repo.write('certs/logo.bin', Buffer.from([0x89, 0x50, 0x00, 0x47]));
    repo.write('package-lock.json', '{\n  "a": 1\n}\n');
    const head = repo.commit('change');

    const inventory = inventoryFor({ kind: 'pr', base: 'base' });

    expect(inventory.head).toBe(head);
    expect(inventory.baseSha).toBe(repo.git('rev-parse', 'base').trim());
    expect(inventory.worktree).toBe(false);
    expect(inventory.files).toEqual([
      expect.objectContaining({
        path: 'certs/logo.bin',
        change: 'A',
        category: 'binary',
        lineCount: 0,
        lineCoverageRequired: false,
      }),
      expect.objectContaining({
        path: 'package-lock.json',
        category: 'lockfile',
        lineCoverageRequired: false,
        chunks: [],
      }),
      expect.objectContaining({
        path: 'src/edit.ts',
        change: 'M',
        lineCount: 200,
        chunks: [
          [1, 150],
          [151, 200],
        ],
      }),
      expect.objectContaining({
        path: 'src/gone.ts',
        change: 'D',
        lineCount: 3,
      }),
      expect.objectContaining({
        path: 'src/new-name.ts',
        change: 'R',
        oldPath: 'src/old-name.ts',
        lineCount: 40,
      }),
    ]);
  });

  it('ignores uncommitted changes unless worktree mode is on', () => {
    repo.write('src/edit.ts', lines(7));
    repo.write('src/untracked.ts', lines(2));
    repo.write('src/keep.ts', '');

    expect(inventoryFor({ kind: 'pr', base: 'base' }).files).toEqual([]);

    const files = inventoryFor({
      kind: 'pr',
      base: 'base',
      worktree: true,
    }).files;
    expect(
      files.map((file) => [file.path, file.change, file.lineCount]),
    ).toEqual([
      ['src/edit.ts', 'M', 7],
      ['src/keep.ts', 'M', 0],
      ['src/untracked.ts', 'A', 2],
    ]);
  });

  it('uses a recorded base sha instead of resolving the base ref again', () => {
    const baseSha = repo.git('rev-parse', 'base').trim();
    repo.write('src/edit.ts', lines(6));
    repo.commit('change');
    repo.git('branch', '-f', 'base', 'HEAD');

    const inventory = inventoryFor({ kind: 'pr', base: 'base', baseSha });

    expect(inventory.baseSha).toBe(baseSha);
    expect(inventory.files.map((file) => file.path)).toEqual(['src/edit.ts']);
  });

  it('lists every tracked file for a repo review, reading deleted-on-disk files from HEAD', () => {
    fs.rmSync(path.join(repo.dir, 'src/keep.ts'));

    const inventory = inventoryFor({ kind: 'repo' });

    expect(inventory.base).toBeNull();
    expect(inventory.files.map((file) => file.path)).toEqual([
      'package-lock.json',
      'src/edit.ts',
      'src/gone.ts',
      'src/keep.ts',
      'src/old-name.ts',
    ]);
    expect(inventory.files.every((file) => file.change === 'tracked')).toBe(
      true,
    );
    expect(
      inventory.files.find((file) => file.path === 'src/keep.ts').lineCount,
    ).toBe(10);
  });

  it('rejects an unknown review kind', () => {
    expect(() => inventoryFor({ kind: 'nightly' })).toThrow(
      'Unknown review kind',
    );
  });
});

describe('readWorktreeFileFrom', () => {
  it('returns file contents, or null for missing paths and directories', () => {
    const repo = createTempRepo();
    try {
      repo.write('src/a.ts', 'x\n');
      const read = readWorktreeFileFrom(repo.dir);
      expect(read('src/a.ts').toString()).toBe('x\n');
      expect(read('src')).toBeNull();
      expect(read('src/missing.ts')).toBeNull();
    } finally {
      repo.remove();
    }
  });
});

describe('checkLedger', () => {
  const criteria = [
    { id: 'ALP-01', area: 'ALP', severity: 'MUST', kinds: ['pr', 'repo'] },
    { id: 'ALP-02', area: 'ALP', severity: 'SHOULD', kinds: ['pr', 'repo'] },
    { id: 'HYG-01', area: 'HYG', severity: 'SHOULD', kinds: ['pr'] },
  ];
  const inventory = {
    kind: 'pr',
    base: 'origin/main',
    baseSha: 'base-sha',
    head: 'head-sha',
    worktree: false,
    files: [
      {
        path: 'src/a.ts',
        change: 'M',
        oldPath: null,
        category: 'source',
        lineCount: 200,
        lineCoverageRequired: true,
        chunks: [
          [1, 150],
          [151, 200],
        ],
      },
      {
        path: 'package-lock.json',
        change: 'M',
        oldPath: null,
        category: 'lockfile',
        lineCount: 10,
        lineCoverageRequired: false,
        chunks: [],
      },
    ],
  };

  const freshLedger = () =>
    completeLedger(
      createLedger({ inventory, criteria, now: '2026-01-01T00:00:00Z' }),
    );

  const check = (ledger, overrides = {}) =>
    checkLedger({
      ledger,
      inventory,
      criteria,
      headSha: 'head-sha',
      fileExists: (filePath) => filePath.startsWith('src/'),
      ...overrides,
    });

  it('creates a skeleton with pending rows for the review kind only', () => {
    const ledger = createLedger({ inventory, criteria, now: 'now' });
    expect(ledger.criteria.map((row) => row.id)).toEqual([
      'ALP-01',
      'ALP-02',
      'HYG-01',
    ]);
    expect(ledger.gates.map((gate) => gate.name)).toEqual(
      REQUIRED_GATES.map((gate) => gate.name),
    );
    expect(ledger.files.every((file) => file.status === 'pending')).toBe(true);
    expect(ledger.verdict).toBe('pending');

    const repoLedger = createLedger({
      inventory: { ...inventory, kind: 'repo' },
      criteria,
      now: 'now',
    });
    expect(repoLedger.criteria.map((row) => row.id)).toEqual([
      'ALP-01',
      'ALP-02',
    ]);
  });

  it('rejects every pending row in a fresh skeleton', () => {
    const errors = check(createLedger({ inventory, criteria, now: 'now' }));
    expect(errors).toEqual(
      expect.arrayContaining([
        'file src/a.ts: still pending',
        'criterion ALP-01: still pending',
        'gate lint: still pending',
        'verdict: still pending',
      ]),
    );
  });

  it('accepts a complete, consistent ledger', () => {
    expect(check(freshLedger())).toEqual([]);
  });

  it('rejects a ledger that is not an object or has the wrong shape', () => {
    expect(check(null)).toEqual(['ledger: not a JSON object']);
    expect(check({ version: 2, kind: 'nightly', files: {} })).toEqual([
      'ledger: version must be 1',
      'ledger: kind must be pr or repo',
      'ledger: files must be an array',
      'ledger: criteria must be an array',
      'ledger: gates must be an array',
      'ledger: findings must be an array',
    ]);
  });

  it('rejects a ledger for an older HEAD', () => {
    expect(check(freshLedger(), { headSha: 'newer' })).toEqual([
      'ledger: head head-sha is not the current HEAD newer; re-run inventory and review the new commits',
    ]);
  });

  describe('files', () => {
    it('rejects missing, extra, duplicate, and changed files', () => {
      const ledger = freshLedger();
      ledger.files[0].lineCount = 150;
      ledger.files.push({ ...ledger.files[1] });
      ledger.files.push({ ...ledger.files[1], path: 'src/extra.ts' });

      expect(check(ledger)).toEqual([
        'file src/a.ts: changed since the inventory (now M, 200 lines); review it again',
        'file package-lock.json: listed more than once',
        'file src/extra.ts: not in the current inventory (remove it or re-run inventory)',
      ]);

      const missing = freshLedger();
      missing.files.pop();
      expect(check(missing)).toEqual([
        'file package-lock.json: in scope but missing from the ledger',
      ]);
    });

    it('requires full line coverage only where coverage is required', () => {
      const ledger = freshLedger();
      ledger.files[0].linesRead = [[1, 150]];
      ledger.files[1].linesRead = [];

      expect(check(ledger)).toEqual([
        'file src/a.ts: linesRead does not cover lines 1-200',
      ]);
    });

    it('requires evidence for reviewed files and a reason for not-inspected files', () => {
      const ledger = freshLedger();
      ledger.files[0].evidence = 'ok';
      ledger.files[1].status = 'not-inspected';
      ledger.files[1].reason = 'skipped';
      ledger.verdict = 'incomplete';

      expect(check(ledger)).toEqual([
        'file src/a.ts: reviewed needs evidence of what was checked',
        'file package-lock.json: not-inspected needs a specific reason',
      ]);
    });

    it('rejects an invalid file status', () => {
      const ledger = freshLedger();
      ledger.files[0].status = 'skimmed';
      expect(check(ledger)).toEqual([
        'file src/a.ts: invalid status "skimmed"',
      ]);
    });
  });

  describe('criteria', () => {
    it('rejects missing, extra, duplicate, and invalid rows', () => {
      const ledger = freshLedger();
      ledger.criteria.push({ ...ledger.criteria[0] });
      ledger.criteria.push({ ...ledger.criteria[0], id: 'ZZZ-01' });
      ledger.criteria[1].status = 'looks-fine';
      ledger.criteria.splice(2, 1);

      expect(check(ledger)).toEqual([
        'criterion ALP-02: invalid status "looks-fine"',
        'criterion ALP-01: listed more than once',
        'criterion ZZZ-01: not a pr criterion in docs/review',
        'criterion HYG-01: missing from the ledger',
      ]);
    });

    it('requires cited evidence for pass and a reason for not-applicable', () => {
      const ledger = freshLedger();
      ledger.criteria[0].evidence = 'Looked at it carefully and it is fine.';
      ledger.criteria[1].status = 'not-applicable';
      ledger.criteria[1].reason = 'n/a';

      expect(check(ledger)).toEqual([
        'criterion ALP-01: pass needs evidence citing a path:line or a backticked command',
        'criterion ALP-02: not-applicable needs a specific reason',
      ]);
    });

    it.each([
      'Read src/components/Header/Header.tsx:58 and the effect cleanup.',
      'Checked src/auth/middleware/ecdsa-auth.guard.ts:13 for the fail-closed exit.',
      'Ran `make lint` and read the output in full.',
    ])('accepts evidence that cites a reference: %s', (evidence) => {
      const ledger = freshLedger();
      ledger.criteria[0].evidence = evidence;
      expect(check(ledger)).toEqual([]);
    });

    it('keeps finding links consistent', () => {
      const ledger = freshLedger();
      ledger.criteria[0].status = 'finding';
      ledger.criteria[1].findings = ['F-9'];

      expect(check(ledger)).toEqual([
        'criterion ALP-01: status finding but no finding IDs listed',
        'criterion ALP-02: lists findings but status is pass',
        'criterion ALP-02: references unknown finding F-9',
      ]);
    });
  });

  describe('gates', () => {
    it('requires every gate, with exit codes that match the status', () => {
      const ledger = freshLedger();
      ledger.gates = ledger.gates.filter((gate) => gate.name !== 'security');
      ledger.gates.find((gate) => gate.name === 'lint').exitCode = 1;
      ledger.gates.find((gate) => gate.name === 'test').exitCode = null;
      Object.assign(
        ledger.gates.find((gate) => gate.name === 'build'),
        { status: 'failed', exitCode: 0 },
      );
      ledger.gates.find((gate) => gate.name === 'format').evidence = '';
      ledger.gates.push({ ...ledger.gates[0] });
      ledger.gates.push({
        name: 'e2e',
        command: 'make e2e',
        status: 'skipped',
      });

      expect(check(ledger)).toEqual([
        'gate lint: passed but exitCode is 1',
        'gate format: needs evidence (output, or why it was not run)',
        'gate test: passed needs an integer exitCode',
        'gate build: failed but exitCode is 0',
        'gate hooks: listed more than once',
        'gate e2e: invalid status "skipped"',
        'gate security: required gate missing',
        'verdict: must be changes-required (a MUST finding from this change or a failed gate)',
      ]);
    });

    it('forces incomplete when a gate was not run', () => {
      const ledger = freshLedger();
      Object.assign(ledger.gates[0], {
        status: 'not-run',
        exitCode: null,
        evidence: 'no network',
      });

      expect(check(ledger)).toEqual([
        'verdict: must be incomplete because a gate was not run',
      ]);
      ledger.verdict = 'incomplete';
      expect(check(ledger)).toEqual([]);
    });
  });

  describe('findings', () => {
    it('accepts a verified SHOULD finding with an approve-with-should verdict', () => {
      const ledger = freshLedger();
      addFinding(ledger);
      ledger.verdict = 'approve-with-should';
      expect(check(ledger)).toEqual([]);
    });

    it('validates ids, severity, confidence, location, text, and flags', () => {
      const ledger = freshLedger();
      addFinding(ledger, {
        id: 'bug-1',
        severity: 'BLOCKER',
        confidence: 2,
        location: 'src/a.ts',
        title: '',
        detail: 'short',
        evidence: '',
        verification: 'maybe',
        preExisting: 'no',
      });
      ledger.verdict = 'incomplete';

      expect(check(ledger)).toEqual([
        'finding bug-1: id must look like F-1',
        'finding bug-1: invalid severity "BLOCKER"',
        'finding bug-1: confidence must be a number from 0 to 1',
        'finding bug-1: location must be path:line or path:start-end',
        'finding bug-1: title is missing or too short',
        'finding bug-1: detail is missing or too short',
        'finding bug-1: evidence is missing or too short',
        'finding bug-1: verification must be verified or unverified',
        'finding bug-1: preExisting must be true or false',
        'finding bug-1: unverified or confidence below 0.7 must be VERIFY',
      ]);
    });

    it('requires VERIFY for unverified or low-confidence findings', () => {
      const ledger = freshLedger();
      addFinding(ledger, { verification: 'unverified' });
      addFinding(ledger, { confidence: 0.5 });
      ledger.verdict = 'approve-with-should';

      expect(check(ledger)).toEqual([
        'finding F-1: unverified or confidence below 0.7 must be VERIFY',
        'finding F-2: unverified or confidence below 0.7 must be VERIFY',
      ]);

      ledger.findings.forEach((finding) => {
        finding.severity = 'VERIFY';
      });
      expect(check(ledger)).toEqual([]);
    });

    it('checks locations exist and criteria link in both directions', () => {
      const ledger = freshLedger();
      addFinding(ledger, { location: 'lib/missing.ts:3-9' });
      addFinding(ledger, { criteria: [] });
      addFinding(ledger, { criteria: ['ZZZ-01'] });
      ledger.findings.push({ ...ledger.findings[0], id: 'F-1' });
      const unlinked = {
        ...ledger.findings[0],
        id: 'F-5',
        criteria: ['ALP-02'],
      };
      ledger.findings.push(unlinked);
      ledger.verdict = 'approve-with-should';

      expect(check(ledger)).toEqual([
        'finding F-1: location path lib/missing.ts does not exist',
        'finding F-2: must reference at least one criterion',
        'finding F-3: references unknown criterion ZZZ-01',
        'finding F-1: duplicate id',
        'finding F-1: location path lib/missing.ts does not exist',
        'finding F-5: location path lib/missing.ts does not exist',
        'finding F-5: criterion ALP-02 does not list it back',
      ]);
    });
  });

  describe('verdict', () => {
    it('rejects an unknown verdict and a non-boolean verifierRan', () => {
      const ledger = freshLedger();
      ledger.verdict = 'lgtm';
      expect(check(ledger)).toEqual(['verdict: invalid value "lgtm"']);

      const noVerifier = freshLedger();
      noVerifier.verification = {};
      expect(check(noVerifier)).toEqual([
        'verification: verifierRan must be true or false',
        'verdict: must be incomplete because the verifier did not run',
      ]);
    });

    it('forces incomplete for not-inspected rows or a missing verifier, listing every reason', () => {
      const ledger = freshLedger();
      ledger.files[0].status = 'not-inspected';
      ledger.files[0].reason = 'Too large to read in this session.';
      ledger.criteria[0].status = 'not-inspected';
      ledger.criteria[0].reason = 'Needs AWS access to check.';
      ledger.verification.verifierRan = false;

      expect(check(ledger)).toEqual([
        'verdict: must be incomplete because a file is not-inspected, a criterion is not-inspected, the verifier did not run',
      ]);
    });

    it('requires changes-required for a new MUST finding', () => {
      const ledger = freshLedger();
      addFinding(ledger, { severity: 'MUST' });
      expect(check(ledger)).toEqual([
        'verdict: must be changes-required (a MUST finding from this change or a failed gate)',
      ]);
      ledger.verdict = 'changes-required';
      expect(check(ledger)).toEqual([]);
    });

    it('treats a pre-existing MUST as non-blocking for a PR but blocking for a repo review', () => {
      const ledger = freshLedger();
      addFinding(ledger, { severity: 'MUST', preExisting: true });
      ledger.verdict = 'approve';
      expect(check(ledger)).toEqual([
        'verdict: approve is not allowed with MUST, SHOULD, or VERIFY findings',
      ]);
      ledger.verdict = 'approve-with-should';
      expect(check(ledger)).toEqual([]);

      const repoInventory = { ...inventory, kind: 'repo' };
      const repoLedger = completeLedger(
        createLedger({ inventory: repoInventory, criteria, now: 'now' }),
      );
      addFinding(repoLedger, { severity: 'MUST', preExisting: true });
      repoLedger.verdict = 'approve-with-should';
      expect(check(repoLedger, { inventory: repoInventory })).toEqual([
        'verdict: must be changes-required (a MUST finding from this change or a failed gate)',
      ]);
    });

    it('rejects changes-required without a blocker and approve-with-should without concerns', () => {
      const ledger = freshLedger();
      ledger.verdict = 'changes-required';
      expect(check(ledger)).toEqual([
        'verdict: changes-required needs a blocking MUST finding or failed gate',
      ]);

      addFinding(ledger, { severity: 'NICE' });
      ledger.verdict = 'approve-with-should';
      expect(check(ledger)).toEqual([
        'verdict: approve-with-should needs at least one SHOULD-level finding',
      ]);
      ledger.verdict = 'approve';
      expect(check(ledger)).toEqual([]);
    });
  });
});

describe('summarizeLedger', () => {
  it('counts statuses and severities', () => {
    expect(
      summarizeLedger({
        files: [{ status: 'reviewed' }, { status: 'reviewed' }],
        criteria: [{ status: 'pass' }, { status: 'finding' }],
        gates: [{ status: 'passed' }],
        findings: [{ severity: 'MUST' }],
        verdict: 'changes-required',
      }),
    ).toEqual({
      files: { reviewed: 2 },
      criteria: { pass: 1, finding: 1 },
      gates: { passed: 1 },
      findings: { MUST: 1 },
      verdict: 'changes-required',
    });
    expect(summarizeLedger({})).toEqual({
      files: {},
      criteria: {},
      gates: {},
      findings: {},
      verdict: undefined,
    });
  });
});
