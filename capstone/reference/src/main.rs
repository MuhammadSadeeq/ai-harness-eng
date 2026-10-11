//! rein-rs: the director's Rust reference of docs/ENGINE.md (BP-4.3). Written from the spec, one
//! milestone at a time; the goldens are the ruling where the spec is ambiguous.

mod canon;
mod eval;
mod prng;
mod run;
mod script;
mod tape;
mod workspace;

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const USAGE: &str = "usage:\n  rein-rs run --tape <file> --board <file> --seed <n> [--wire] [--facts <file>]\n  rein-rs eval --eval <file> --board <file> [--scenarios <dir>] [--facts <file>]";

type Failure = (u8, String);

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
        Some("run") => run_command(&args[1..]),
        Some("eval") => eval::command(&args[1..]),
        _ => Err((2, USAGE.into())),
    }
}

fn usage(message: impl Into<String>) -> Failure {
    (2, format!("{}\n{USAGE}", message.into()))
}

struct RunArgs {
    tape: PathBuf,
    board: PathBuf,
    seed: i64,
    wire: bool,
    facts: PathBuf,
}

fn parse_run(args: &[String]) -> Result<RunArgs, Failure> {
    let mut tape = None;
    let mut board = None;
    let mut seed = None;
    let mut wire = false;
    let mut facts = None;
    let mut rest = args.iter();
    while let Some(flag) = rest.next() {
        match flag.as_str() {
            "--wire" => wire = true,
            "--choices" => {
                return Err((2, "--choices is not implemented in this reference (no judge run uses it)".into()))
            }
            "--tape" | "--board" | "--seed" | "--facts" => {
                let value = rest
                    .next()
                    .ok_or_else(|| usage(format!("{flag} needs a value")))?;
                match flag.as_str() {
                    "--tape" => tape = Some(PathBuf::from(value)),
                    "--board" => board = Some(PathBuf::from(value)),
                    "--facts" => facts = Some(PathBuf::from(value)),
                    _ => {
                        seed = Some(
                            value
                                .parse::<i64>()
                                .map_err(|_| usage(format!("--seed must be an integer, not {value}")))?,
                        )
                    }
                }
            }
            other => return Err(usage(format!("unknown option {other}"))),
        }
    }
    Ok(RunArgs {
        tape: tape.ok_or_else(|| usage("--tape is required"))?,
        board: board.ok_or_else(|| usage("--board is required"))?,
        seed: seed.ok_or_else(|| usage("--seed is required"))?,
        wire,
        facts: facts.unwrap_or_else(|| PathBuf::from("site/data/facts.json")),
    })
}

/// The facts registry, when the file is there (a tape that names a fact says so if it is not).
pub fn facts_if_present(path: &Path) -> Result<Option<serde_json::Map<String, serde_json::Value>>, Failure> {
    if !path.exists() {
        return Ok(None);
    }
    tape::load_facts(path).map(Some).map_err(|message| (2, message))
}

fn run_command(args: &[String]) -> Result<(), Failure> {
    let parsed = parse_run(args)?;
    let facts = facts_if_present(&parsed.facts)?;
    let tape = tape::load_tape(&parsed.tape, facts.as_ref()).map_err(|m| (2, m))?;
    let board = tape::load_board(&parsed.board).map_err(|m| (2, m))?;
    let mut run = run::Run::new(&tape, &board, parsed.seed).map_err(|m| (2, m))?;
    run.execute().map_err(|m| (2, m))?;
    let lines = if parsed.wire { &run.wire } else { &run.events };
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    for line in lines {
        writeln!(out, "{line}").map_err(|error| (2, format!("stdout: {error}")))?;
    }
    Ok(())
}
