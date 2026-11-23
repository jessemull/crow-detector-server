/** @jest-environment node */
const {
  CRITERIA_FIXTURES,
  addFinding,
  completeLedger,
  createTempRepo,
  lines,
} = require('./test-utils/repo');
const { main: inventoryMain } = require('./inventory');
const { main } = require('./check-ledger');

describe('check-ledger main', () => {
  let repo;
  let out;
  let err;
  const ledgerArg = '.review/test/ledger.json';

  const deps = () => ({
    cwd: repo.dir,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  });
  const run = (argv) => main(argv, deps());
  const readLedger = () => JSON.parse(repo.read(ledgerArg));
  const writeLedger = (ledger) => repo.write(ledgerArg, JSON.stringify(ledger));

  beforeEach(() => {
    out = [];
    err = [];
    repo = createTempRepo();
    for (const [filePath, content] of Object.entries(CRITERIA_FIXTURES)) {
      repo.write(filePath, content);
    }
    repo.write('.gitignore', '.review/\n');
    repo.write('src/a.ts', lines(5));
    repo.commit('base');
    repo.git('branch', 'base');
    repo.write('src/a.ts', lines(20));
    repo.commit('change');
    inventoryMain(['--kind', 'pr', '--base', 'base', '--init', ledgerArg], {
      ...deps(),
      stderr: () => {},
    });
    out = [];
  });

  afterEach(() => repo.remove());

  it('prints usage for missing or extra arguments', () => {
    expect(run([])).toBe(2);
    expect(run(['a.json', 'b.json'])).toBe(2);
    expect(run(['--help'])).toBe(2);
    expect(err[0]).toContain('Usage:');
  });

  it('fails on an unreadable ledger', () => {
    expect(run(['.review/missing.json'])).toBe(1);
    expect(err[0]).toContain('Could not read .review/missing.json');
  });

  it('rejects the pending skeleton and prints a summary', () => {
    expect(run([ledgerArg])).toBe(1);
    expect(out).toEqual(
      expect.arrayContaining([
        `Ledger ${ledgerArg}`,
        '  files:    pending 1',
        '  criteria: pending 3',
        '  findings: none',
        '  verdict:  pending',
      ]),
    );
    expect(err).toEqual(
      expect.arrayContaining([
        '  - file src/a.ts: still pending',
        '  - verdict: still pending',
      ]),
    );
    expect(err[err.length - 1]).toContain('The review is not finished.');
  });

  it('accepts a complete ledger whose findings point at real files', () => {
    const ledger = completeLedger(readLedger());
    addFinding(ledger, { location: 'docs/review/alpha.md:7' });
    ledger.verdict = 'approve-with-should';
    writeLedger(ledger);

    expect(run([ledgerArg])).toBe(0);
    expect(out[out.length - 1]).toContain('Ledger is complete and consistent.');
    expect(err).toEqual([]);
  });

  it('rejects a ledger after new commits land', () => {
    writeLedger(completeLedger(readLedger()));
    repo.write('src/b.ts', lines(2));
    repo.commit('more');

    expect(run([ledgerArg])).toBe(1);
    expect(err.join('\n')).toContain('is not the current HEAD');
    expect(err.join('\n')).toContain(
      'file src/b.ts: in scope but missing from the ledger',
    );
  });

  it('fails when the criteria files are invalid', () => {
    repo.write('docs/review/broken.md', '**Review kinds:** pr\n');
    expect(run([ledgerArg])).toBe(1);
    expect(err[0]).toContain('broken.md: no criteria found');
  });

  it('fails when the inventory cannot be rebuilt', () => {
    writeLedger({ ...readLedger(), kind: 'nightly' });
    expect(run([ledgerArg])).toBe(1);
    expect(err[0]).toContain('Could not rebuild the inventory');
  });
});
