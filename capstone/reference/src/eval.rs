//! The eval command (ENGINE.md A11.7, A11.8, A12.2 and A12.3): each task's tape run once per trial,
//! graded by the code grader and, with a model grader, by a simulated judge with its own PRNG.

use crate::canon::trace_line;
use crate::prng::Rng;
use crate::run::Run;
use crate::tape::{field, int, load_board, load_tape, object, read_json, text, Res, Tape};
use crate::Failure;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

struct Grader {
    false_pass: i64,
    false_fail: i64,
}

struct Task {
    id: String,
    tape: String,
}

struct Spec {
    id: String,
    kind: String,
    tasks: Vec<Task>,
    trials: i64,
    seed_base: i64,
    grader: Option<Grader>,
}

fn percent_field(map: &Map<String, Value>, key: &str) -> Res<i64> {
    let value = int(field(map, key, "model_grader")?, key)?;
    if (0..=100).contains(&value) {
        Ok(value)
    } else {
        Err(format!("model_grader.{key} must be 0 to 100"))
    }
}

fn load_spec(path: &Path) -> Res<Spec> {
    let root = read_json(path)?;
    let map = object(&root, "the eval")?;
    let kind = text(field(map, "kind", "the eval")?, "kind")?;
    if kind != "capability" && kind != "regression" {
        return Err("kind must be capability or regression".into());
    }
    let items = field(map, "tasks", "the eval")?
        .as_array()
        .ok_or("tasks must be a list")?;
    if items.is_empty() || items.len() > 20 {
        return Err("an eval has 1 to 20 tasks".into());
    }
    let mut ids = std::collections::BTreeSet::new();
    let mut tasks = Vec::new();
    for item in items {
        let task = object(item, "a task")?;
        let id = text(field(task, "id", "a task")?, "task.id")?;
        let tape = text(field(task, "tape", "a task")?, "task.tape")?;
        if !ids.insert(id.clone()) {
            return Err(format!("task id {id} is listed twice"));
        }
        if !valid_tape_id(&tape) {
            return Err(format!("task {id} names a tape that is not an id: {tape}"));
        }
        tasks.push(Task { id, tape });
    }
    let trials = int(field(map, "trials", "the eval")?, "trials")?;
    if !(1..=50).contains(&trials) {
        return Err("trials must be 1 to 50".into());
    }
    let seed_base = match map.get("seed_base") {
        None => 0,
        Some(value) => int(value, "seed_base")?,
    };
    if seed_base < 0 {
        return Err("seed_base must be 0 or more".into());
    }
    let grader = match map.get("model_grader") {
        None => None,
        Some(value) => {
            let grader = object(value, "model_grader")?;
            Some(Grader {
                false_pass: percent_field(grader, "false_pass_percent")?,
                false_fail: percent_field(grader, "false_fail_percent")?,
            })
        }
    };
    Ok(Spec {
        id: text(field(map, "id", "the eval")?, "id")?,
        kind,
        tasks,
        trials,
        seed_base,
        grader,
    })
}

fn valid_tape_id(id: &str) -> bool {
    let mut chars = id.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// A11.7 and A12: scenarios/<id>.json, else scenarios/engine/<id>.json.
fn tape_path(scenarios: &Path, id: &str) -> Res<PathBuf> {
    for candidate in [scenarios.join(format!("{id}.json")), scenarios.join("engine").join(format!("{id}.json"))] {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(format!("tape {id} resolves to no file under {}", scenarios.display()))
}

/// What one trial's run reports: the run_end fields and whether it leaked.
struct Outcome {
    status: String,
    passed: bool,
    turns: i64,
    tokens: Value,
    cost: i64,
    leaked: bool,
}

fn outcome_of(events: &[String]) -> Res<Outcome> {
    let mut end = None;
    let mut leaked = false;
    for line in events {
        let event: Value = serde_json::from_str(line).map_err(|error| error.to_string())?;
        match event["kind"].as_str() {
            Some("run_end") => end = Some(event),
            Some("leak") => leaked = true,
            _ => {}
        }
    }
    let end = end.ok_or("a run ended without run_end")?;
    Ok(Outcome {
        status: end["status"].as_str().unwrap_or("").to_string(),
        passed: end["passed"] == true,
        turns: end["turns"].as_i64().unwrap_or(0),
        tokens: end["tokens"].clone(),
        cost: end["cost"].as_i64().unwrap_or(0),
        leaked,
    })
}

fn run_trial(tape: &Tape, board: &crate::tape::Board, seed: i64) -> Res<Outcome> {
    let mut run = Run::new(tape, board, seed)?;
    run.execute()?;
    outcome_of(&run.events)
}

pub fn command(args: &[String]) -> Result<(), Failure> {
    let parsed = parse_args(args)?;
    let spec = load_spec(&parsed.eval).map_err(|m| (2, m))?;
    let facts = crate::facts_if_present(&parsed.facts)?;
    let board = load_board(&parsed.board).map_err(|m| (2, m))?;
    let mut tapes: BTreeMap<String, Tape> = BTreeMap::new();
    for task in &spec.tasks {
        if !tapes.contains_key(&task.tape) {
            let path = tape_path(&parsed.scenarios, &task.tape).map_err(|m| (2, m))?;
            let tape = load_tape(&path, facts.as_ref()).map_err(|m| (2, m))?;
            tapes.insert(task.tape.clone(), tape);
        }
    }

    let mut results = Vec::new();
    let mut summary = Tally::default();
    for (index, task) in spec.tasks.iter().enumerate() {
        let tape = &tapes[&task.tape];
        let mut task_passes = 0;
        let mut task_all = true;
        for trial in 1..=spec.trials {
            let outcome = run_trial(tape, &board, trial).map_err(|m| (2, m))?;
            let code = outcome.status == "done" && outcome.passed;
            let mut row = Map::new();
            row.insert("task".into(), json!(task.id));
            row.insert("trial".into(), json!(trial));
            row.insert("status".into(), json!(outcome.status));
            row.insert("passed".into(), json!(outcome.passed));
            row.insert("code".into(), json!(code));
            row.insert("leaked".into(), json!(outcome.leaked));
            let model = spec.grader.as_ref().map(|grader| {
                let mut judge = Rng::new((spec.seed_base + 1000 * index as i64 + trial) as u32);
                let draw = judge.percent();
                if code {
                    draw >= grader.false_fail
                } else if outcome.status == "done" {
                    draw < grader.false_pass
                } else {
                    false
                }
            });
            if let Some(model) = model {
                row.insert("model".into(), json!(model));
            }
            row.insert("turns".into(), json!(outcome.turns));
            row.insert("tokens".into(), outcome.tokens.clone());
            row.insert("cost".into(), json!(outcome.cost));
            summary.runs += 1;
            summary.code += i64::from(code);
            summary.leaked += i64::from(outcome.leaked);
            summary.cost += outcome.cost;
            if let Some(model) = model {
                summary.model += i64::from(model);
                summary.agree += i64::from(model == code);
            }
            task_passes += i64::from(code);
            task_all &= code;
            results.push(Value::Object(row));
        }
        summary.tasks += 1;
        summary.tasks_any += i64::from(task_passes > 0);
        summary.tasks_all += i64::from(task_all);
    }

    let mut out = Map::new();
    out.insert("eval".into(), json!(spec.id));
    out.insert("board".into(), json!(board.id));
    out.insert("kind".into(), json!(spec.kind));
    out.insert("trials".into(), json!(spec.trials));
    out.insert("results".into(), json!(results));
    out.insert("summary".into(), summary.render(spec.grader.is_some()));
    let line = trace_line(&Value::Object(out)).map_err(|m| (2, m))?;
    println!("{line}");
    Ok(())
}

#[derive(Default)]
struct Tally {
    runs: i64,
    code: i64,
    leaked: i64,
    model: i64,
    agree: i64,
    tasks: i64,
    tasks_any: i64,
    tasks_all: i64,
    cost: i64,
}

impl Tally {
    fn render(&self, graded: bool) -> Value {
        let mut map = Map::new();
        map.insert("runs".into(), json!(self.runs));
        map.insert("code".into(), json!(self.code));
        map.insert("leaked".into(), json!(self.leaked));
        if graded {
            map.insert("model".into(), json!(self.model));
            map.insert("agree".into(), json!(self.agree));
        }
        map.insert("tasks".into(), json!(self.tasks));
        map.insert("tasks_any_pass".into(), json!(self.tasks_any));
        map.insert("tasks_all_pass".into(), json!(self.tasks_all));
        map.insert("cost".into(), json!(self.cost));
        Value::Object(map)
    }
}

struct EvalArgs {
    eval: PathBuf,
    board: PathBuf,
    scenarios: PathBuf,
    facts: PathBuf,
}

fn parse_args(args: &[String]) -> Result<EvalArgs, Failure> {
    let mut eval = None;
    let mut board = None;
    let mut scenarios = PathBuf::from("scenarios");
    let mut facts = PathBuf::from("site/data/facts.json");
    let mut rest = args.iter();
    while let Some(flag) = rest.next() {
        let value = rest
            .next()
            .ok_or_else(|| (2, format!("{flag} needs a value")))?;
        match flag.as_str() {
            "--eval" => eval = Some(PathBuf::from(value)),
            "--board" => board = Some(PathBuf::from(value)),
            "--scenarios" => scenarios = PathBuf::from(value),
            "--facts" => facts = PathBuf::from(value),
            other => return Err((2, format!("unknown option {other}"))),
        }
    }
    Ok(EvalArgs {
        eval: eval.ok_or((2, "--eval is required".to_string()))?,
        board: board.ok_or((2, "--board is required".to_string()))?,
        scenarios,
        facts,
    })
}
