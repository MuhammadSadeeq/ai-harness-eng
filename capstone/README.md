# Rein in Rust: the capstone

ENGINE.md is an exact spec. The course has two runtimes, the JavaScript simulator and Rein
(Python), and both reproduce the same golden traces. The capstone adds a third: you write the
engine in Rust (or any language you like) and the judge tells you, byte for byte, where your
runtime differs from the course's traces.

## What it proves

- Your runtime reads the same tapes and boards and speaks the same command line as the other two.
- Every golden run matches: the events line by line, and the wire payloads by their SHA-256 digest.
- Every eval (the graded tasks, with their model judge) matches the same way.

The judge has no opinion about your code. It runs your command, compares the output with the
golden, and names the first line that differs, with its `seq` and `kind`.

## Run the judge

From the repository root:

```
python3 tools/parity.py --cmd "<your command> run" --milestone M1
```

- `--cmd` is the command that runs your runtime. It must end in `run`; the judge runs it without a
  shell. Evals run as the same command with `eval` in place of `run`.
- `--milestone M3` judges every golden of M1 to M3. Leave it out to judge all of them.
- `--only <tape>` judges one tape or eval; `--jobs N` runs N at a time (default 4).
- `--assign` prints each golden's milestone and the features that put it there.

Each run is called as `<command> run --tape T --board B --seed N --facts site/data/facts.json`,
with `--wire` added for the wire check (the facts path is absolute). Your runtime must accept those flags. Evals are called as
`<command> eval --eval E --board B --scenarios <repo>/scenarios --facts <repo>/site/data/facts.json`.

Each failing run prints one line: the first differing line, its `seq` and `kind`, and both sides.
A run that exits non-zero or takes more than 10 seconds fails, and its message ends with the last
line of your stderr. The last line is always

```
parity: <k> of <n> runs match (M1–M3)
```

The exit status is 0 only when every run matches. The judge never edits a golden.

## The milestone checklist

Each golden belongs to the lowest milestone that has every feature it uses (`capstone/milestones.json`
says which feature is which; `--assign` shows the result). Work through them in order.

| Milestone | What it adds | Read in ENGINE.md | Golden runs it unlocks | Cumulative |
|---|---|---|---|---|
| M1 | The core run: tape, scripted model, board modules, events, cost | sections 1 to 11 | 27 | 27 |
| M2 | Context overflow, the simulated human, the rulings from building both runtimes (tool order, list output) | A1 to A3 | 12 | 39 |
| M3 | Incident tapes (the hunt's content) and the harness bugs on purpose: the forgetful history, reading the first block only | A4, A5 | 75 | 114 |
| M4 | Compaction, the clock, prompt caching, input checks, split results, effort | A6 to A8 | 93 | 207 |
| M5 | Tool overrides, tool search, tamperable tests with the pristine gate, cost attribution | A9, A10 | 54 | 261 |
| M6 | Evals (the graded tasks), prompt injection, canaries, tool provenance and pinned servers | A11 to A13 | 46 | 307 |
| M7 | Sub-agents, sessions, crash and resume, ledgers with retries and idempotency, model profiles, a board's rules | A14 to A19 | 101 | 408 |

The counts are the judge's (`--assign` lists each golden). A milestone's runs use only that
milestone's features and the ones before it, so a learner who has passed M3 has passed the
cumulative judge for M1 to M3.

## The Rust kit

`capstone/rust-skeleton/` is a Cargo project that parses the shared command line, reads a tape and
a board, and prints the first event of a run in the canonical JSON. It fails the judge on purpose,
with a readable message, until you write the run loop. Its README covers canonical JSON and number
formatting, the one thing most likely to bite.

## The Interview Room

In the Interview Room (I5) you tell this story out loud, as I4.o4 asks: the design of your runtime,
the parity evidence (the judge's last line for your last milestone), and one bug the judge caught,
named by its line, `seq` and `kind`. Show the first differing line and say what the spec said.

## Time

The course's estimate for this module is 60 minutes (I4 in `docs/CURRICULUM.md`, the Min column).
That figure covers the module itself. Building all seven milestones is a project in its own right,
so plan for it that way and use the judge's counts to pace the work.
