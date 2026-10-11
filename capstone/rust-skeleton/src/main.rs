//! rein-rs: the capstone kit for ENGINE.md. It has the shared command line, reads a tape and a
//! board, and prints the first event of a run in canonical JSON. The run loop is yours to write.
//! README.md says what to do next.

mod canonical;

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// A failure: the exit status (2 for usage and loader errors, as both reference CLIs use) and
/// the line printed after `rein-rs: `.
type Failure = (u8, String);

const USAGE: &str = "usage:\n  rein-rs run --tape <file> --board <file> --seed <n> \
[--wire | --choices] [--facts <file>]\n  rein-rs eval --eval <file> --board <file> \
[--scenarios <dir>] [--facts <file>]";

struct RunArgs {
    tape: PathBuf,
    board: PathBuf,
    seed: i64,
    wire: bool,
    choices: bool,
    // Read when the run computes costs (step 6); parsed now so the command line is complete.
    #[allow(dead_code)]
    facts: PathBuf,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match dispatch(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err((status, message)) => {
            eprintln!("rein-rs: {message}");
            ExitCode::from(status)
        }
    }
}

fn dispatch(args: &[String]) -> Result<(), Failure> {
    match args.first().map(String::as_str) {
        Some("run") => run(&parse_run(&args[1..])?),
        Some("eval") => Err((
            1,
            "eval is not written yet: it is milestone M6 (README.md, step list)".into(),
        )),
        _ => Err(usage("expected a command: run or eval")),
    }
}

fn usage(message: impl Into<String>) -> Failure {
    (2, format!("{}\n{USAGE}", message.into()))
}

fn parse_run(args: &[String]) -> Result<RunArgs, Failure> {
    let mut tape = None;
    let mut board = None;
    let mut seed = None;
    let mut wire = false;
    let mut choices = false;
    let mut facts = None;
    let mut rest = args.iter();
    while let Some(flag) = rest.next() {
        match flag.as_str() {
            "--wire" => wire = true,
            "--choices" => choices = true,
            "--tape" | "--board" | "--seed" | "--facts" => {
                let value = rest
                    .next()
                    .ok_or_else(|| usage(format!("{flag} needs a value")))?;
                match flag.as_str() {
                    "--tape" => tape = Some(PathBuf::from(value)),
                    "--board" => board = Some(PathBuf::from(value)),
                    "--facts" => facts = Some(PathBuf::from(value)),
                    _ => {
                        let parsed = value
                            .parse::<i64>()
                            .map_err(|_| usage(format!("--seed must be an integer, not {value}")))?;
                        seed = Some(parsed);
                    }
                }
            }
            other => return Err(usage(format!("unknown option {other}"))),
        }
    }
    if wire && choices {
        return Err(usage("--wire and --choices cannot be combined"));
    }
    Ok(RunArgs {
        tape: tape.ok_or_else(|| usage("--tape is required"))?,
        board: board.ok_or_else(|| usage("--board is required"))?,
        seed: seed.ok_or_else(|| usage("--seed is required"))?,
        wire,
        choices,
        facts: facts.unwrap_or_else(|| PathBuf::from("site/data/facts.json")),
    })
}

fn run(args: &RunArgs) -> Result<(), Failure> {
    let tape = read_json(&args.tape)?;
    let board = read_json(&args.board)?;
    let tape_id = text_field(&tape, "id", &args.tape)?;
    let board_id = text_field(&board, "id", &args.board)?;
    if args.wire || args.choices {
        return Err((
            1,
            "--wire and --choices come with the model loop, which is not written yet \
             (README.md, step list)"
                .into(),
        ));
    }
    let event = json!({
        "agent": "main",
        "board": board_id,
        "kind": "run_start",
        "model_id": text_field(&tape, "model_id", &args.tape)?,
        "run": format!("{tape_id}:{board_id}:{}", args.seed),
        "seed": args.seed,
        "seq": 0,
        "t": 0,
        "task": text_field(&tape, "task", &args.tape)?,
        "turn": 0,
        "v": 1,
        "wire": "loop",
    });
    let line = canonical::trace_line(&event).map_err(|message| (1, message))?;
    println!("{line}");
    Err((
        1,
        "the run loop is not written yet: only run_start was printed (README.md, step list)"
            .into(),
    ))
}

fn read_json(path: &Path) -> Result<Value, Failure> {
    let text = std::fs::read_to_string(path)
        .map_err(|error| (2, format!("{}: {error}", path.display())))?;
    serde_json::from_str(&text).map_err(|error| (2, format!("{}: not JSON: {error}", path.display())))
}

fn text_field<'a>(doc: &'a Value, key: &str, path: &Path) -> Result<&'a str, Failure> {
    doc.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| (2, format!("{}: {key} must be a string", path.display())))
}
