# An eval study

Project three of the I3 set. You answer one harness question with an eval, a cost figure and a discussion of the noise.

## README

Name: `<project name>`.

What was built: an eval that answers one harness question, with a cost figure and an account of the noise.

How to run. From the repo root, after installing rein once with `python -m pip install -e ./rein`:

    python -m rein eval --eval <eval file> --board <board file> --out results.json
    python -m rein results results.json --markdown

Seed: `<seed_base, and trials 1 to N>`.

Results (the columns `rein results --markdown` prints):

| Task | Passed of trials | Wilson 95% interval | Tokens | Cost | Scripted |
|---|---|---|---|---|---|
| `<task id>` | `<passed>` of `<trials>` | `<low>` to `<high>` % | `<tokens>` | `<cost>` | `<yes or no>` |

Claimed: `<the one harness question, with the interval that answers it>`.
Not claimed: `<what the eval does not show, such as a difference inside the noise or a model you did not run>`.

Licence: `<licence name, for example MIT>`.

## Question

Question: `<one harness question, such as whether an independent reviewer helps on small bug fixes>`.

## Scope

Two weeks, one measured result. If it cannot finish in two weeks, cut it until it can.

## Results

Say whether each number is scripted (a line of its own). Scripted runs repeat exactly; real model runs vary.

| Task | Passed of trials | Wilson 95% interval | Tokens | Cost | Scripted |
|---|---|---|---|---|---|
| `<task id>` | `<passed>` of `<trials>` | `<low>` to `<high>` % | `<tokens>` | `<cost>` | `<yes or no>` |

## Noise

Say how much of the difference could be luck, using the interval for each row. Report pass^k where every trial must succeed.

## Write-up outline

1. **Question.** One sentence: what you want to know, and what result would change your mind.
2. **Method.** The tasks, the trials per task, the seeds or inputs, and the one thing you changed between the two boards.
3. **Reproduce.** The exact command and its seed or inputs, so a reviewer can run it again.
4. **Results.** The table above, with every row, and one sentence on what the interval says.
5. **Limits.** What the result does not claim, in your own words. A write-up with no limits is not finished.
