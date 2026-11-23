# Review evals

> **AI agents — read this file when:** changing the review skills, the criteria in `docs/review/`, or the scripts in `scripts/review/`.

The review system is only as good as what it catches. These evals measure that with seeded defects for PR reviews (`seeded-cases.json`). Run them before and after changing a review skill or the criteria, and keep the change only if recall does not drop.

---

## Seeded PR cases

Each case in `seeded-cases.json` is a small, realistic change with a known defect and the criteria a good review must cite. `control-benign` has no defect and measures false positives. `mixed-large` combines several defects in one diff to test for stopping early and losing focus in a large diff.

```bash
# Check every case still applies to the current code (run after source changes)
npm run review:eval -- validate

# List cases and how many findings each expects
npm run review:eval -- list
```

### Run one case

1. Start from a clean tree on a throwaway branch: `git switch -c eval/<case-id>-<run> origin/main`.
2. Apply the case: `npm run review:eval -- apply <case-id>`.
3. Commit it with the case's `summary` as the message (`git commit -am "<summary>" --no-verify` is acceptable here only because the branch is never pushed).
4. In a **fresh agent session** (no memory of the case file), run the `pr-review` skill with base `HEAD~1`. Do not tell the agent it is an eval or what to look for.
5. Score the ledger: `npm run review:eval -- score <case-id> .review/<name>/ledger.json`.
6. Triage every unmatched finding as a true or false positive and record it.
7. Delete the branch.

A case counts as found when a MUST, SHOULD, or VERIFY finding is at the expected path and cites at least one expected criterion. Severity mismatches are reported separately.

### Comparing versions

- Run each case at least 3 times per version (fresh session each time); review agents are not deterministic.
- Use at least two different models when the change is about wording in a skill.
- Record per case: found or missed, severity, unmatched findings (true or false positive), and whether `check-ledger` passed.
- Compare the old skill (from `main`) against the new one on the same cases. A change that lowers recall on any case needs a stated reason.

---

## Repo review recall

There is no recall set checked in. The previous one was removed after its open items were fixed. After a full `repo-review`, write a new `repo-recall.md` from issues the review should have found, and score later runs against it. Do not read that file before or during the review you are scoring.

---

## Maintaining the cases

- A case's `find` text must occur exactly once in its file. `validate` fails when code drifts; update the case to match the new code, keeping the same defect.
- Add a case whenever a review misses a real defect: reproduce the defect as a minimal edit and list the criteria that should have caught it.
- Keep `expected` honest: list only what a careful reviewer must find, not every possible comment.
