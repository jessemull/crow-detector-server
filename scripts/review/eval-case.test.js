/** @jest-environment node */
const { createTempRepo } = require('./test-utils/repo');
const {
  applyEdits,
  countOccurrences,
  main,
  resolveEdits,
  resolveExpected,
  scoreLedger,
  validateCases,
} = require('./eval-case');

const CASES = {
  version: 1,
  cases: [
    {
      id: 'flip',
      title: 'Flip a condition',
      summary: 'fix: flip',
      edits: [{ path: 'src/a.js', find: 'a === b', replace: 'a !== b' }],
      expected: [
        {
          label: 'Condition flipped',
          path: 'src/a.js',
          criteria: ['COR-01'],
          severity: 'MUST',
        },
      ],
    },
    {
      id: 'drop-guard',
      title: 'Drop a guard',
      summary: 'refactor: drop guard',
      edits: [{ path: 'src/b.js', find: 'if (!ok) throw err;\n', replace: '' }],
      expected: [
        {
          label: 'Guard removed',
          path: 'src/b.js',
          criteria: ['NET-02', 'ERR-04'],
        },
      ],
    },
    {
      id: 'both',
      title: 'Both',
      summary: 'feat: both',
      includes: ['flip', 'drop-guard'],
      edits: [{ path: 'src/a.js', find: 'const x = 1;', replace: '$& // $1' }],
    },
  ],
};

describe('eval-case helpers', () => {
  it('counts non-overlapping occurrences', () => {
    expect(countOccurrences('aaaa', 'aa')).toBe(2);
    expect(countOccurrences('abc', 'z')).toBe(0);
    expect(countOccurrences('abc', '')).toBe(0);
  });

  it('resolves included cases before the case itself', () => {
    expect(resolveEdits(CASES.cases, 'both').map((edit) => edit.path)).toEqual([
      'src/a.js',
      'src/b.js',
      'src/a.js',
    ]);
    expect(
      resolveExpected(CASES.cases, 'both').map((item) => item.label),
    ).toEqual(['Condition flipped', 'Guard removed']);
    expect(() => resolveEdits(CASES.cases, 'nope')).toThrow(
      'Unknown case "nope"',
    );
    expect(() => resolveExpected(CASES.cases, 'nope')).toThrow(
      'Unknown case "nope"',
    );
  });

  it('detects include cycles', () => {
    const cyclic = [
      { id: 'a', includes: ['b'] },
      { id: 'b', includes: ['a'] },
    ];
    expect(() => resolveEdits(cyclic, 'a')).toThrow(
      'Case "a" includes itself through a -> b',
    );
  });

  it('applies edits literally and reports missing files and ambiguous text', () => {
    const files = { 'x.js': 'one two two\n' };
    const read = (filePath) => files[filePath] ?? null;

    expect(
      applyEdits(
        [{ path: 'x.js', find: 'one', replace: '$&$&' }],
        read,
      ).files.get('x.js'),
    ).toBe('$&$& two two\n');
    expect(
      applyEdits(
        [
          { path: 'x.js', find: 'two', replace: '' },
          { path: 'x.js', find: 'three', replace: '' },
          { path: 'y.js', find: 'a', replace: '' },
        ],
        read,
      ).errors,
    ).toEqual([
      'x.js: find text occurs 2 times (must be exactly once): "two"',
      'x.js: find text occurs 0 times (must be exactly once): "three"',
      'y.js: file does not exist',
    ]);
  });

  it('validates case metadata and edits', () => {
    const read = () => 'a === b\nif (!ok) throw err;\nconst x = 1;\n';
    expect(validateCases(CASES, read)).toEqual([]);

    const broken = {
      cases: [
        {
          id: 'dup',
          title: 'T',
          summary: 'S',
          edits: [{ path: 'f', find: 'zzz', replace: '' }],
        },
        {
          id: 'dup',
          title: '',
          summary: '',
          edits: [],
          expected: [{ path: 'f', criteria: [] }],
        },
        { id: 'loop', title: 'T', summary: 'S', includes: ['loop'] },
      ],
    };
    expect(validateCases(broken, read)).toEqual([
      'dup: duplicate id',
      'dup: needs a title and a summary',
      'dup: each expected entry needs a path and criteria',
      'dup: f: find text occurs 0 times (must be exactly once): "zzz"',
      'dup: f: find text occurs 0 times (must be exactly once): "zzz"',
      'loop: Case "loop" includes itself through loop',
    ]);
  });

  it('scores recall by path and criterion, ignoring NICE findings', () => {
    const expected = resolveExpected(CASES.cases, 'both');
    const score = scoreLedger(expected, {
      findings: [
        {
          id: 'F-1',
          severity: 'SHOULD',
          location: 'src/a.js:3',
          criteria: ['COR-01'],
        },
        {
          id: 'F-2',
          severity: 'NICE',
          location: 'src/b.js:1',
          criteria: ['NET-02'],
        },
        {
          id: 'F-3',
          severity: 'VERIFY',
          location: 'src/c.js:1',
          criteria: ['SEC-01'],
        },
      ],
    });

    expect(score.found).toBe(1);
    expect(score.recall).toBe(0.5);
    expect(score.results[0]).toMatchObject({
      found: true,
      findingId: 'F-1',
      severity: 'SHOULD',
      severityMatches: false,
    });
    expect(score.results[1]).toMatchObject({
      found: false,
      severityMatches: false,
    });
    expect(score.unmatched.map((finding) => finding.id)).toEqual([
      'F-2',
      'F-3',
    ]);

    const control = scoreLedger([], {});
    expect(control.recall).toBeNull();
    expect(control.unmatched).toEqual([]);
  });
});

describe('eval-case main', () => {
  let repo;
  let out;
  let err;

  const run = (argv) =>
    main(argv, {
      cwd: repo.dir,
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
    });

  beforeEach(() => {
    out = [];
    err = [];
    repo = createTempRepo();
    repo.write('evals/review/seeded-cases.json', JSON.stringify(CASES));
    repo.write('src/a.js', 'if (a === b) {}\nconst x = 1;\n');
    repo.write('src/b.js', 'if (!ok) throw err;\nreturn data;\n');
    repo.commit('base');
    repo.git('switch', '-q', '-c', 'eval/test');
  });

  afterEach(() => repo.remove());

  it('prints usage', () => {
    expect(run([])).toBe(2);
    expect(err[0]).toContain('Usage:');
    expect(run(['--help'])).toBe(0);
    expect(out[0]).toContain('Usage:');
    expect(run(['bogus'])).toBe(2);
    expect(err[err.length - 1]).toContain('Unknown command bogus');
  });

  it('fails without a cases file', () => {
    repo.write('evals/review/seeded-cases.json', '{not json');
    expect(run(['list'])).toBe(1);
    expect(err[0]).toContain('Could not read evals/review/seeded-cases.json');
  });

  it('lists cases with their expected counts', () => {
    expect(run(['list'])).toBe(0);
    expect(out).toEqual([
      'flip                         1 expected  Flip a condition',
      'drop-guard                   1 expected  Drop a guard',
      'both                         2 expected  Both',
    ]);
  });

  it('validates the cases against the tree', () => {
    expect(run(['validate'])).toBe(0);
    expect(out[0]).toBe('All 3 cases apply cleanly.');

    repo.write('src/a.js', 'changed\n');
    expect(run(['validate'])).toBe(1);
    expect(err[err.length - 1]).toContain('problem(s)');
  });

  it('applies a case on a clean eval branch', () => {
    expect(run(['apply', 'both'])).toBe(0);
    expect(out[0]).toBe(
      'Applied both to 2 file(s). Commit it on this branch, then run pr-review against the parent commit.',
    );
    expect(repo.read('src/a.js')).toBe('if (a !== b) {}\n$& // $1\n');
    expect(repo.read('src/b.js')).toBe('return data;\n');
  });

  it('refuses to apply on main, on a dirty tree, or with bad edits', () => {
    expect(run(['apply'])).toBe(2);

    repo.write('src/a.js', 'dirty a === b\nconst x = 1;\n');
    expect(run(['apply', 'flip'])).toBe(1);
    expect(err[err.length - 1]).toContain('Working tree is not clean');
    expect(run(['apply', 'flip', '--force'])).toBe(0);

    repo.write('src/a.js', 'nothing here\n');
    expect(run(['apply', 'flip', '--force'])).toBe(1);
    expect(err[err.length - 1]).toContain('find text occurs 0 times');

    expect(run(['apply', 'missing', '--force'])).toBe(1);
    expect(err[err.length - 1]).toBe('Unknown case "missing"');

    repo.git('checkout', '-q', '--', '.');
    repo.git('switch', '-q', 'main');
    expect(run(['apply', 'flip'])).toBe(1);
    expect(err[err.length - 1]).toContain(
      'Refusing to apply a seeded case on main',
    );
  });

  it('scores a ledger', () => {
    repo.write(
      '.review/ledger.json',
      JSON.stringify({
        findings: [
          {
            id: 'F-1',
            severity: 'MUST',
            location: 'src/a.js:1',
            criteria: ['COR-01'],
            title: 'Flip',
          },
          {
            id: 'F-2',
            severity: 'SHOULD',
            location: 'src/z.js:1',
            criteria: ['DOC-01'],
            title: 'Other',
          },
        ],
      }),
    );

    expect(run(['score', 'both', '.review/ledger.json'])).toBe(0);
    expect(out).toEqual([
      'FOUND  Condition flipped [src/a.js; COR-01] (F-1, MUST)',
      'MISSED Guard removed [src/b.js; NET-02, ERR-04]',
      '\nRecall: 1/2 (50%)',
      'Other findings to triage as true or false positives: 1',
      '  F-2 SHOULD src/z.js:1 Other',
    ]);

    out = [];
    repo.write(
      '.review/ledger.json',
      JSON.stringify({
        findings: [
          {
            id: 'F-1',
            severity: 'SHOULD',
            location: 'src/a.js:1',
            criteria: ['COR-01'],
          },
        ],
      }),
    );
    expect(run(['score', 'flip', '.review/ledger.json'])).toBe(0);
    expect(out[0]).toBe(
      'FOUND  Condition flipped [src/a.js; COR-01] (F-1, SHOULD, severity differs)',
    );

    expect(run(['score', 'flip'])).toBe(2);
  });

  it('reports a score for a case with no expected findings', () => {
    const control = {
      cases: [
        {
          id: 'control',
          title: 'Control',
          summary: 'docs: x',
          edits: [],
          expected: [],
        },
      ],
    };
    repo.write('evals/review/seeded-cases.json', JSON.stringify(control));
    repo.write('.review/ledger.json', JSON.stringify({ findings: [] }));

    expect(run(['score', 'control', '.review/ledger.json'])).toBe(0);
    expect(out).toEqual([
      '\nRecall: 0/0',
      'Other findings to triage as true or false positives: 0',
    ]);
  });
});
