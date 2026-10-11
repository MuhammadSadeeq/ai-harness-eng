# An open-source contribution to a real harness

Project two of the I3 set. You make one small, reviewed change to a real harness and record what you did.

## README

Name: `<owner/name of the harness, and your branch>`.

What was built: one small, reviewed change to a real harness, with the reproduction that failed before it.

How to run, from the repo root, in the harness's own setup:

    <the command that fails before your change>
    <the same command after your change, which passes>

If your change is measured with rein, also:

    python -m rein results results.json --markdown

Seed: `<the seed or input the reproduction uses>`.

Results (the columns `rein results --markdown` prints, if you measured with rein):

| Task | Passed of trials | Wilson 95% interval | Tokens | Cost | Scripted |
|---|---|---|---|---|---|
| `<task id>` | `<passed>` of `<trials>` | `<low>` to `<high>` % | `<tokens>` | `<cost>` | `<yes or no>` |

Claimed: `<the one behaviour your change fixes, and the test that shows it>`.
Not claimed: `<what the change does not fix, and whether it was merged>`.

Licence: `<licence name, for example MIT>`.

## Question

Question: `<which failing test or doc gap you reproduced, and what your change fixes>`.

## Scope

Two weeks, one measured result. If it cannot finish in two weeks, cut it until it can.

## Results

Say whether each number is scripted (a line of its own). Scripted runs repeat exactly; real model runs vary.

| Task | Passed of trials | Wilson 95% interval | Tokens | Cost | Scripted |
|---|---|---|---|---|---|
| `<task id>` | `<passed>` of `<trials>` | `<low>` to `<high>` % | `<tokens>` | `<cost>` | `<yes or no>` |

## Contribution

Repository: `<owner/name>`. Reproduction: `<the command that fails before your change>`. Pull request: `<link>`.
Say whether it was merged; a pull request that is open is evidence of work, not of a merged change.

## Write-up outline

1. **Question.** One sentence: what you want to know, and what result would change your mind.
2. **Method.** The tasks, the trials per task, the seeds or inputs, and the one thing you changed between the two boards.
3. **Reproduce.** The exact command and its seed or inputs, so a reviewer can run it again.
4. **Results.** The table above, with every row, and one sentence on what the interval says.
5. **Limits.** What the result does not claim, in your own words. A write-up with no limits is not finished.
