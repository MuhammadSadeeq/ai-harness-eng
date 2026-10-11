# Rein, extended and measured

Project one of the I3 set. You start from the course's own harness, Rein, and add one extension, then measure it.

## Question

Question: `<what the extension changes, and for which tasks>`.

## Scope

Two weeks, one measured result. If it cannot finish in two weeks, cut it until it can.

## Results

Say whether each number is scripted (a line of its own). Scripted runs repeat exactly; real model runs vary.

| Task | Passed of trials | Wilson 95% interval | Tokens | Cost | Scripted |
|---|---|---|---|---|---|
| `<task id>` | `<passed>` of `<trials>` | `<low>` to `<high>` % | `<tokens>` | `<cost>` | `<yes or no>` |

## Extension

Name the one extension and the file it touches: `<file>`. Ten real eval tasks, five trials each, one before-and-after experiment.

## Write-up outline

1. **Question.** One sentence: what you want to know, and what result would change your mind.
2. **Method.** The tasks, the trials per task, the seeds or inputs, and the one thing you changed between the two boards.
3. **Reproduce.** The exact command and its seed or inputs, so a reviewer can run it again.
4. **Results.** The table above, with every row, and one sentence on what the interval says.
5. **Limits.** What the result does not claim, in your own words. A write-up with no limits is not finished.
