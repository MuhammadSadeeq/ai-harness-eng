# H13 process check: the worked example

This folder holds the extension and the control task used by the H13 page,
"Rein extensions, ranked". The package itself is unchanged. The patch adds a
process check to the eval grader: a trial whose run wrote a file it had not
read first does not count as passed.

Files:

- `write-before-read.patch`: the change to `rein/src/rein/evals.py`, in git
  format. It applies to the committed file.
- `scenarios/d1-control-write-first.json` and `scenarios/evals/d1-control.json`:
  a control task that writes each file before it reads it, with the same checks
  as the suite.

Run every command from the repository root. Install rein once with
`python -m pip install -e ./rein`, or put `PYTHONPATH=rein/src` in front of
each `python -m rein` command.

## The scope, written before any code

- Question: does the write-before-read check change how many trials pass on the
  D1 suite?
- Command and seed: the suite and the `d1-old` board, ten trials per task. Trial
  k runs with seed k, for k from 1 to 10.
- Decisive number: passes out of ten, for each task.
- Prediction: no change, because every suite task reads each file before it
  writes it.

## Commands

Baseline, the suite:

    python -m rein eval --eval scenarios/evals/d1-suite.json --board scenarios/boards/d1-old.json --out baseline.json
    python -m rein results baseline.json --markdown

Baseline, the control:

    python -m rein eval --eval rein/examples/h13-process-check/scenarios/evals/d1-control.json --board scenarios/boards/d1-old.json --out control-baseline.json

With the check, the suite and the control. Apply the patch, run, then revert it:

    git apply rein/examples/h13-process-check/write-before-read.patch
    python -m rein eval --eval scenarios/evals/d1-suite.json --board scenarios/boards/d1-old.json --out extension.json
    python -m rein eval --eval rein/examples/h13-process-check/scenarios/evals/d1-control.json --board scenarios/boards/d1-old.json --out control-extension.json
    git apply -R rein/examples/h13-process-check/write-before-read.patch

## Expected pass counts

The numbers are scripted: they repeat exactly. A real model's numbers would vary.

| Run | Suite, each of 5 tasks | Control |
|---|---|---|
| Baseline | 10 of 10 | 10 of 10 |
| With the check | 10 of 10 | 0 of 10 |

Tokens do not change between the two runs. The control uses 31,770 in and
1,910 out in both. The suite rows match the page's Table H13.1.

`python -m pytest tools/tests/test_h13_example.py` checks these numbers in CI.
