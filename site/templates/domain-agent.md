# A domain agent with a security write-up

Project four of the I3 set. You build an agent for one job and write up its risks and the one leg you removed.

## Question

Question: `<the job, and whether the agent stays safe when its inputs are hostile>`.

## Scope

Two weeks, one measured result. If it cannot finish in two weeks, cut it until it can.

## Results

Say whether each number is scripted (a line of its own). Scripted runs repeat exactly; real model runs vary.

| Task | Passed of trials | Wilson 95% interval | Tokens | Cost | Scripted |
|---|---|---|---|---|---|
| `<task id>` | `<passed>` of `<trials>` | `<low>` to `<high>` % | `<tokens>` | `<cost>` | `<yes or no>` |

## The three legs

Private data it can read: `<...>`. Untrusted text it reads: `<...>`. Action it can take outside: `<...>`.
Remove one, `<which leg>`, and show it: `<the hostile-input test that now fails to do harm>`.

## Write-up outline

1. **Question.** One sentence: what you want to know, and what result would change your mind.
2. **Method.** The tasks, the trials per task, the seeds or inputs, and the one thing you changed between the two boards.
3. **Reproduce.** The exact command and its seed or inputs, so a reviewer can run it again.
4. **Results.** The table above, with every row, and one sentence on what the interval says.
5. **Limits.** What the result does not claim, in your own words. A write-up with no limits is not finished.
