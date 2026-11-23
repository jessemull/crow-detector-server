/** @jest-environment node */
const fs = require('fs');
const path = require('path');

const {
  CRITERIA_FIXTURES,
  createTempRepo,
  lines,
} = require('./test-utils/repo');
const { main, parseArgs } = require('./inventory');

describe('inventory parseArgs', () => {
  it('parses every option', () => {
    expect(
      parseArgs([
        '--kind',
        'pr',
        '--base',
        'main',
        '--worktree',
        '--init',
        'x.json',
        '--force',
        '--json',
      ]),
    ).toEqual({
      kind: 'pr',
      base: 'main',
      worktree: true,
      init: 'x.json',
      force: true,
      json: true,
      help: false,
    });
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it.each([
    [[], '--kind pr or --kind repo is required'],
    [['--kind', 'nightly'], '--kind pr or --kind repo is required'],
    [['--kind'], '--kind needs a value'],
    [['--kind', 'pr', '--base', '--worktree'], '--base needs a value'],
    [['--kind', 'repo', '--worktree'], '--worktree only applies to --kind pr'],
    [['--kind', 'pr', '--verbose'], 'Unknown argument --verbose'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe('inventory main', () => {
  let repo;
  let out;
  let err;

  const run = (argv, deps = {}) =>
    main(argv, {
      cwd: repo.dir,
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      now: () => '2026-01-01T00:00:00.000Z',
      nodeVersion: 'v26.1.0',
      ...deps,
    });

  beforeEach(() => {
    out = [];
    err = [];
    repo = createTempRepo();
    for (const [filePath, content] of Object.entries(CRITERIA_FIXTURES)) {
      repo.write(filePath, content);
    }
    repo.write('.nvmrc', '26\n');
    repo.write('.husky/_/h', '');
    repo.write('src/a.ts', lines(5));
    repo.commit('base');
    repo.git('branch', 'base');
    repo.git('config', 'core.hooksPath', '.husky/_');
    repo.write('src/a.ts', lines(160));
    repo.write('src/b.ts', lines(3));
    repo.commit('change');
  });

  afterEach(() => repo.remove());

  it('prints usage for --help and for bad arguments', () => {
    expect(run(['--help'])).toBe(0);
    expect(out[0]).toContain('Usage:');
    expect(run(['--kind'])).toBe(2);
    expect(err[0]).toContain('--kind needs a value');
  });

  it('prints the PR inventory with a chunk plan', () => {
    expect(run(['--kind', 'pr', '--base', 'base'])).toBe(0);
    const text = out.join('\n');
    expect(text).toMatch(
      /^PR review: base \([0-9a-f]{40}\) \.\. HEAD \([0-9a-f]{40}\)/,
    );
    expect(text).toContain('2 files, 163 lines, 3 chunks of at most 150 lines');
    expect(text).toContain('By category: source 2');
    expect(text).toContain(
      'M       source    src/a.ts  [160 lines, 2 chunk(s)]',
    );
    expect(err).toEqual([]);
  });

  it('prints JSON and describes renames and uncovered files', () => {
    repo.git('mv', 'src/b.ts', 'src/c.ts');
    repo.write('package-lock.json', '{}\n');
    repo.commit('rename');

    expect(run(['--kind', 'pr', '--base', 'base', '--json'])).toBe(0);
    const inventory = JSON.parse(out[0]);
    expect(inventory.files.map((file) => file.path)).toEqual([
      'package-lock.json',
      'src/a.ts',
      'src/c.ts',
    ]);

    out = [];
    expect(run(['--kind', 'pr', '--base', 'HEAD~1'])).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('src/c.ts (from src/b.ts)');
    expect(text).toContain('package-lock.json  [line coverage not required]');
  });

  it('prints a repo inventory', () => {
    expect(run(['--kind', 'repo'])).toBe(0);
    expect(out[0]).toMatch(/^Repo review at HEAD [0-9a-f]{40}\n7 files/);
    expect(out[0]).toContain(
      'tracked source    src/b.ts  [3 lines, 1 chunk(s)]',
    );
  });

  it('reports an empty diff', () => {
    expect(run(['--kind', 'pr', '--base', 'HEAD'])).toBe(0);
    expect(out.join('\n')).toContain('By category: none');
  });

  it('warns about a dirty tree, missing hooks, and a Node mismatch', () => {
    repo.write('src/a.ts', 'dirty\n');
    repo.git('config', '--unset', 'core.hooksPath');

    expect(
      run(['--kind', 'pr', '--base', 'base'], { nodeVersion: 'v24.0.0' }),
    ).toBe(0);
    expect(err).toEqual([
      'warning: Working tree has uncommitted changes that this inventory ignores. Commit them or use --worktree.',
      'warning: Husky hooks are not installed. Run npm run prepare.',
      'warning: Node v24.0.0 does not match .nvmrc (26). Run nvm use before running gates.',
    ]);

    err = [];
    expect(run(['--kind', 'repo'])).toBe(0);
    expect(err[0]).toBe(
      'warning: Working tree has uncommitted changes; the repo review reads files as they are on disk.',
    );

    err = [];
    expect(run(['--kind', 'pr', '--base', 'base', '--worktree'])).toBe(0);
    expect(err).toEqual([
      'warning: Husky hooks are not installed. Run npm run prepare.',
    ]);
  });

  it('skips the Node check when there is no .nvmrc', () => {
    fs.rmSync(path.join(repo.dir, '.nvmrc'));
    repo.commit('drop nvmrc');
    expect(run(['--kind', 'repo'], { nodeVersion: 'v1.0.0' })).toBe(0);
    expect(err).toEqual([]);
  });

  it('writes a pending ledger and refuses to overwrite it without --force', () => {
    const ledgerArg = '.review/test/ledger.json';
    expect(run(['--kind', 'pr', '--base', 'base', '--init', ledgerArg])).toBe(
      0,
    );
    expect(out[out.length - 1]).toContain(
      'Wrote .review/test/ledger.json: 2 files, 3 criteria, 7 gates, all pending.',
    );

    const ledger = JSON.parse(repo.read(ledgerArg));
    expect(ledger).toMatchObject({
      version: 1,
      kind: 'pr',
      base: 'base',
      worktree: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      verdict: 'pending',
    });
    expect(ledger.criteria.map((row) => row.id)).toEqual([
      'ALP-01',
      'ALP-02',
      'HYG-01',
    ]);

    expect(run(['--kind', 'pr', '--base', 'base', '--init', ledgerArg])).toBe(
      1,
    );
    expect(err[err.length - 1]).toContain('already exists');

    expect(run(['--kind', 'repo', '--init', ledgerArg, '--force'])).toBe(0);
    expect(JSON.parse(repo.read(ledgerArg)).kind).toBe('repo');
  });

  it('fails when the criteria files are invalid', () => {
    repo.write('docs/review/broken.md', '- **BRK-01** (MUST) No kinds.\n');
    expect(run(['--kind', 'repo', '--init', 'ledger.json'])).toBe(1);
    expect(err[err.length - 1]).toContain(
      'broken.md: missing "**Review kinds:**" line',
    );
  });

  it('fails when the base cannot be resolved', () => {
    expect(run(['--kind', 'pr', '--base', 'no-such-ref'])).toBe(1);
    expect(err[0]).toContain('Could not build the inventory');
  });
});
