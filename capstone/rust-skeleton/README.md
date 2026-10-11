# Rein in Rust: the kit

This is the starting point for the capstone. It does three things: it parses the shared command
line (`run` and `eval`), it reads a tape and a board, and it prints the first event of a run
(`run_start`) in the canonical JSON the golden traces use. It does not run a scenario yet. The
run loop is yours to write, one milestone at a time (see `../README.md`).

## Build and the first parity run

```
cd capstone/rust-skeleton
cargo build
cd ../..
python3 tools/parity.py --cmd "capstone/rust-skeleton/target/debug/rein-rs run" --milestone M1
```

The first run fails on purpose. Each M1 run ends with
`exit 1: rein-rs: the run loop is not written yet ...`, and the last line is
`parity: 0 of N runs match (M1–M1)`, where N is the number of M1 runs the judge counts. The first line the kit prints is already correct: check it
against the golden with `head -1 scenarios/golden/d1-example-a.d1-new.0.jsonl`. Your work starts
with the second line, `prompt_built` (ENGINE.md section 7.1).

## Layout

- `src/main.rs`: the command line (the same flags as `python -m rein.sim` and
  `node tools/sim_cli.mjs`), reading the tape and the board, and the `run_start` event.
- `src/canonical.rs`: `trace_line` (a trace file's line) and `pyjson` (the token estimate's form),
  with tests. Use them for every line you print.
- `Cargo.toml`: `serde_json` with `preserve_order`, so objects keep their insertion order.

## Canonical JSON and number formatting

This is the one thing most likely to bite, and the judge will show you exactly where.

1. **Two forms, not one.** A trace line has its keys sorted and no spaces:
   `{"agent":"main","board":"d1-new","kind":"run_start",...}`. The token estimate uses
   `pyjson`: keys in the order you built them, with `", "` and `": "`. `trace_line` and `pyjson`
   are different functions on purpose. Do not use one for both.
2. **One space changes a number.** `tokens(x)` is `floor(len(pyjson(x)) / 4)`. A stray space
   changes a token count, which changes a context check, a compaction, a cost and then a golden
   line. Count bytes of the exact form; do not estimate.
3. **serde_json's own `to_string` is not the canonical form.** It keeps insertion order (with
   `preserve_order`), writes non-ASCII as raw UTF-8, and prints every float with a decimal point.
   The canonical form sorts keys (for traces), escapes everything above `~` as lowercase `\uXXXX`
   in UTF-16 units (so `😀` is `😀`), and never prints a float.
4. **Integers only (ENGINE.md section 1).** Time is integer milliseconds, cost is integer
   nano-units, probabilities are integer percent. `serde_json` reads `1.0` and `1e3` as floats, so
   `as_i64()` returns `None`, and `trace_line` refuses them with an error instead of printing them.
   Where the spec says `floor`, use integer division on non-negative values. Never convert to
   `f64` to compute a result that goes into an event.
5. **Every line ends with a newline.** The judge compares bytes, and the wire digest is the
   SHA-256 of the output with a newline after each line.

The first line of a golden is the model for all of this:

```
{"agent":"main","board":"d1-new","kind":"run_start","model_id":"claude-sonnet-5-5","run":"d1-example-a:d1-new:0","seed":0,"seq":0,"t":0,"task":"Rename hi to greet in greet.py.","turn":0,"v":1,"wire":"loop"}
```

Run `cargo test` to see the canonical forms checked on the kit's own fixtures.

## Next

Read ENGINE.md sections 1, 2, 5 and 9 (the tape, the event fields), then the milestone checklist in
`../README.md`. Build M1 first and run the judge after each change.
