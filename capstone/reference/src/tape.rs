//! Loading tapes, boards and the facts registry (ENGINE.md sections 5, 7, A3.19).

use crate::script::{parse_steps, Step};
use crate::workspace::{normal, Files, Node};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::path::Path;

pub type Res<T> = Result<T, String>;

pub fn read_json(path: &Path) -> Res<Value> {
    let text = std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
    serde_json::from_str(&text).map_err(|error| format!("{}: not JSON: {error}", path.display()))
}

pub fn object<'a>(value: &'a Value, what: &str) -> Res<&'a Map<String, Value>> {
    value.as_object().ok_or_else(|| format!("{what} must be an object"))
}

pub fn text(value: &Value, what: &str) -> Res<String> {
    value.as_str().map(str::to_string).ok_or_else(|| format!("{what} must be a string"))
}

pub fn int(value: &Value, what: &str) -> Res<i64> {
    value.as_i64().ok_or_else(|| format!("{what} must be an integer"))
}

pub fn field<'a>(map: &'a Map<String, Value>, key: &str, what: &str) -> Res<&'a Value> {
    map.get(key).ok_or_else(|| format!("{what} is missing {key}"))
}

#[derive(Clone, Copy)]
pub struct Price {
    pub input_milli: i64,
    pub output_milli: i64,
    pub cache_write_milli: Option<i64>,
    pub cache_read_milli: Option<i64>,
}

/// A commitment the run builds up (A6.2).
pub struct Note {
    pub id: String,
    pub kind: String,
    pub turn: i64,
    pub text: String,
}

/// The tape's effort block (A7.3): a default level and the thinking tokens of each level.
pub struct Effort {
    pub default: Option<String>,
    pub thinking: BTreeMap<String, i64>,
}

pub const LEVELS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

pub struct Check {
    pub file: String,
    pub contains: Option<String>,
    pub not_contains: Option<String>,
    pub lines: Option<i64>,
}

pub struct CustomResult {
    pub matches: Vec<(String, Value)>,
    pub output: String,
    pub ok: bool,
}

pub struct CustomTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    pub latency_ms: i64,
    pub results: Vec<CustomResult>,
    pub default_output: String,
    pub default_ok: bool,
    pub effect: Option<String>,
    pub server: Option<String>,
    pub version: Option<String>,
    pub ledger: Option<String>,
    pub lose_reply: Vec<i64>,
}

/// A tape test (A9.3): active while its marker file contains the marker text; an active test
/// passes when its check holds.
pub struct TestCase {
    pub marker_file: String,
    pub marker_text: String,
    pub check_file: String,
    pub check_contains: Option<String>,
    pub check_not_contains: Option<String>,
}

pub struct Outage {
    pub from_ms: i64,
    pub to_ms: i64,
    pub kind: String,
    pub retry_after_ms: i64,
}

/// The simulated approver (ENGINE.md section 5 and A2): a default, optional deny_if, optional fatigue.
pub struct Human {
    pub default: String,
    pub deny_if: Vec<(String, String)>,
    pub fatigue: Option<(i64, i64)>,
}

/// A sub-agent's definition (A14.1).
pub struct AgentDef {
    pub script: Vec<Step>,
    pub system: Option<String>,
}

/// A model profile (A14.5): its prices, the parameters it rejects, and its own script if any.
pub struct Profile {
    pub price: Price,
    pub rejects: Vec<String>,
    pub script: Option<Vec<Step>>,
}

pub struct Tape {
    pub sessions: Vec<Vec<Step>>,
    pub agents: BTreeMap<String, AgentDef>,
    pub models: BTreeMap<String, Profile>,
    pub crash: Option<i64>,
    pub canaries: Vec<String>,
    pub id: String,
    pub task: String,
    pub model_id: String,
    pub price: Price,
    pub window: i64,
    pub system: String,
    pub rules: Vec<String>,
    pub files: Files,
    pub tools: Vec<String>,
    pub custom_tools: Vec<CustomTool>,
    pub checks: Vec<Check>,
    pub test_pass: String,
    pub test_fail: String,
    pub script: Vec<Step>,
    pub human: Human,
    pub interrupt: Option<(i64, bool)>,
    pub faults: Vec<(i64, String)>,
    pub outage: Option<Outage>,
    pub notes: Vec<Note>,
    pub effort: Option<Effort>,
    pub cache_rules: Option<(i64, i64)>,
    pub tests: Vec<TestCase>,
}

pub fn load_tape(path: &Path, facts: Option<&Map<String, Value>>) -> Res<Tape> {
    let root = read_json(path)?;
    let map = object(&root, "the tape")?;
    let id = text(field(map, "id", "the tape")?, "id")?;
    let price = price_of(field(map, "pricing", "the tape")?, facts)?;
    let sessions = match map.get("sessions") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => {
            if !(2..=5).contains(&items.len()) {
                return Err("sessions are 2 to 5".into());
            }
            items
                .iter()
                .map(|item| parse_steps(field(object(item, "a session")?, "script", "a session")?))
                .collect::<Res<Vec<_>>>()?
        }
        Some(_) => return Err("sessions must be a list".into()),
    };
    let models_has_script = map
        .get("models")
        .and_then(Value::as_object)
        .map(|m| m.values().any(|p| p.get("script").is_some()))
        .unwrap_or(false);
    if !sessions.is_empty() && models_has_script {
        return Err("a model profile's script cannot replace sessions (A17.3)".into());
    }
    let mut files = Files::default();
    for (key, value) in object(field(map, "workspace", "the tape")?, "workspace")? {
        let node = match value {
            Value::String(content) => Node::Text(content.clone()),
            Value::Object(link) => Node::Link(text(field(link, "link", "a link")?, "link")?),
            _ => return Err("a workspace file is text or {\"link\": path}".into()),
        };
        files.inside.insert(normal(key), node);
    }
    if let Some(outside) = map.get("outside") {
        for (key, value) in object(outside, "outside")? {
            files.outside.insert(normal(key), text(value, "an outside file")?);
        }
    }
    let test_output = object(field(map, "test_output", "the tape")?, "test_output")?;
    Ok(Tape {
        id,
        task: text(field(map, "task", "the tape")?, "task")?,
        model_id: text(field(map, "model_id", "the tape")?, "model_id")?,
        price,
        window: int(field(map, "window", "the tape")?, "window")?,
        system: text(field(map, "system", "the tape")?, "system")?,
        rules: string_list(map.get("rules"), "rules")?,
        files,
        tools: string_list(map.get("tools"), "tools")?,
        custom_tools: custom_tools(map.get("custom_tools"))?,
        checks: checks(map.get("checks"))?,
        test_pass: text(field(test_output, "pass", "test_output")?, "test_output.pass")?,
        test_fail: text(field(test_output, "fail", "test_output")?, "test_output.fail")?,
        script: match map.get("script") {
            Some(steps) => parse_steps(steps)?,
            None if map.contains_key("sessions") => Vec::new(),
            None => return Err("the tape is missing script".into()),
        },
        human: human_of(map.get("human"))?,
        interrupt: interrupt_of(map.get("interrupt"))?,
        faults: faults_of(map.get("faults"))?,
        outage: outage_of(map.get("outage"))?,
        notes: notes_of(map.get("notes"))?,
        effort: effort_of(map.get("effort"))?,
        cache_rules: cache_rules_of(map.get("cache_rules"))?,
        tests: tests_of(map.get("tests"))?,
        canaries: canaries_of(map.get("canaries"))?,
        sessions,
        agents: agents_of(map.get("agents"))?,
        models: models_of(map.get("models"), facts)?,
        crash: match map.get("crash") {
            None | Some(Value::Null) => None,
            Some(found) => Some(int(field(object(found, "crash")?, "turn", "crash")?, "crash.turn")?),
        },
    })
}

fn agents_of(value: Option<&Value>) -> Res<BTreeMap<String, AgentDef>> {
    let mut agents = BTreeMap::new();
    let Some(found) = value else {
        return Ok(agents);
    };
    for (name, def) in object(found, "agents")? {
        let map = object(def, "an agent")?;
        agents.insert(
            name.clone(),
            AgentDef {
                script: parse_steps(field(map, "script", "an agent")?)?,
                system: map.get("system").map(|s| text(s, "agent.system")).transpose()?,
            },
        );
    }
    Ok(agents)
}

fn models_of(value: Option<&Value>, facts: Option<&Map<String, Value>>) -> Res<BTreeMap<String, Profile>> {
    let mut models = BTreeMap::new();
    let Some(found) = value else {
        return Ok(models);
    };
    for (id, def) in object(found, "models")? {
        let map = object(def, "a model profile")?;
        let rejects = string_list(map.get("rejects"), "rejects")?;
        models.insert(
            id.clone(),
            Profile {
                price: price_of(field(map, "pricing", "a model profile")?, facts)?,
                rejects,
                script: match map.get("script") {
                    None => None,
                    Some(steps) => Some(parse_steps(steps)?),
                },
            },
        );
    }
    Ok(models)
}

/// A11.3: secret strings the tape plants; non-empty and distinct.
fn canaries_of(value: Option<&Value>) -> Res<Vec<String>> {
    let names = string_list(value, "canaries")?;
    let mut seen = std::collections::BTreeSet::new();
    for name in &names {
        if name.is_empty() || !seen.insert(name.clone()) {
            return Err("canaries are non-empty and distinct".into());
        }
    }
    Ok(names)
}

fn tests_of(value: Option<&Value>) -> Res<Vec<TestCase>> {
    let Some(Value::Array(items)) = value else {
        return Ok(Vec::new());
    };
    items
        .iter()
        .map(|item| {
            let map = object(item, "a test")?;
            text(field(map, "id", "a test")?, "id")?;
            let marker = object(field(map, "marker", "a test")?, "marker")?;
            let check = object(field(map, "check", "a test")?, "check")?;
            let optional = |value: Option<&Value>| -> Res<Option<String>> {
                value.map(|v| text(v, "a test check")).transpose()
            };
            Ok(TestCase {
                marker_file: text(field(marker, "file", "marker")?, "marker.file")?,
                marker_text: text(field(marker, "contains", "marker")?, "marker.contains")?,
                check_file: text(field(check, "file", "check")?, "check.file")?,
                check_contains: optional(check.get("contains"))?,
                check_not_contains: optional(check.get("not_contains"))?,
            })
        })
        .collect()
}

fn notes_of(value: Option<&Value>) -> Res<Vec<Note>> {
    let Some(Value::Array(items)) = value else {
        return Ok(Vec::new());
    };
    let mut seen = std::collections::BTreeSet::new();
    let mut notes = Vec::new();
    for item in items {
        let map = object(item, "a note")?;
        let id = text(field(map, "id", "a note")?, "note.id")?;
        let kind = text(field(map, "kind", "a note")?, "note.kind")?;
        if !["goal", "constraint", "decision", "progress", "file"].contains(&kind.as_str()) {
            return Err(format!("note {id} has an unknown kind {kind}"));
        }
        if !seen.insert(id.clone()) {
            return Err(format!("note id {id} is listed twice"));
        }
        notes.push(Note {
            id,
            kind,
            turn: int(field(map, "turn", "a note")?, "note.turn")?,
            text: text(field(map, "text", "a note")?, "note.text")?,
        });
    }
    Ok(notes)
}

fn effort_of(value: Option<&Value>) -> Res<Option<Effort>> {
    let Some(found) = value else {
        return Ok(None);
    };
    let map = object(found, "effort")?;
    let default = match map.get("default") {
        None => None,
        Some(level) => Some(level_of(level)?),
    };
    let mut thinking = BTreeMap::new();
    if let Some(table) = map.get("thinking_tokens") {
        for (level, count) in object(table, "thinking_tokens")? {
            thinking.insert(level_name(level)?, int(count, "thinking_tokens")?);
        }
    }
    Ok(Some(Effort { default, thinking }))
}

fn level_of(value: &Value) -> Res<String> {
    level_name(&text(value, "an effort level")?)
}

fn level_name(name: &str) -> Res<String> {
    if LEVELS.contains(&name) {
        Ok(name.to_string())
    } else {
        Err(format!("unknown effort level {name}"))
    }
}

fn cache_rules_of(value: Option<&Value>) -> Res<Option<(i64, i64)>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(found) => {
            let map = object(found, "cache_rules")?;
            Ok(Some((
                int(field(map, "min_tokens", "cache_rules")?, "min_tokens")?,
                int(field(map, "ttl_ms", "cache_rules")?, "ttl_ms")?,
            )))
        }
    }
}

/// A3.12: a tape without `human` is answered by deny.
fn human_of(value: Option<&Value>) -> Res<Human> {
    let Some(found) = value else {
        return Ok(Human {
            default: "deny".into(),
            deny_if: Vec::new(),
            fatigue: None,
        });
    };
    let map = object(found, "human")?;
    let deny_if = match map.get("deny_if") {
        None => Vec::new(),
        Some(fields) => object(fields, "human.deny_if")?
            .iter()
            .map(|(key, glob)| Ok((key.clone(), text(glob, "a deny_if glob")?)))
            .collect::<Res<Vec<_>>>()?,
    };
    let fatigue = match map.get("fatigue") {
        None => None,
        Some(fat) => {
            let fat = object(fat, "human.fatigue")?;
            Some((
                int(field(fat, "after", "fatigue")?, "fatigue.after")?,
                int(field(fat, "approve_percent", "fatigue")?, "fatigue.approve_percent")?,
            ))
        }
    };
    Ok(Human {
        default: map
            .get("default")
            .map(|d| text(d, "human.default"))
            .transpose()?
            .unwrap_or_else(|| "deny".into()),
        deny_if,
        fatigue,
    })
}

fn string_list(value: Option<&Value>, what: &str) -> Res<Vec<String>> {
    match value {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Array(items)) => items.iter().map(|item| text(item, what)).collect(),
        Some(_) => Err(format!("{what} must be a list")),
    }
}

fn price_of(pricing: &Value, facts: Option<&Map<String, Value>>) -> Res<Price> {
    let map = object(pricing, "pricing")?;
    if let Some(fact) = map.get("fact") {
        let id = text(fact, "pricing.fact")?;
        let registry = facts.ok_or_else(|| format!("pricing names the fact {id}; give --facts"))?;
        let entry = registry
            .get(&id)
            .and_then(|entry| entry.get("value"))
            .and_then(Value::as_object)
            .ok_or_else(|| format!("no fact {id} with a value object"))?;
        let usd = |key: &str| -> Res<f64> {
            entry
                .get(key)
                .and_then(Value::as_f64)
                .ok_or_else(|| format!("fact {id} has no {key}"))
        };
        let cache = |key: &str| entry.get(key).and_then(Value::as_f64).map(milli);
        return Ok(Price {
            input_milli: milli(usd("input_usd_per_mtok")?),
            output_milli: milli(usd("output_usd_per_mtok")?),
            cache_write_milli: cache("cache_write_usd_per_mtok"),
            cache_read_milli: cache("cache_hit_usd_per_mtok"),
        });
    }
    let inline = |key: &str| map.get(key).and_then(Value::as_i64);
    Ok(Price {
        input_milli: int(field(map, "input_milli_per_mtok", "pricing")?, "input_milli_per_mtok")?,
        output_milli: int(field(map, "output_milli_per_mtok", "pricing")?, "output_milli_per_mtok")?,
        cache_write_milli: inline("cache_write_milli_per_mtok"),
        cache_read_milli: inline("cache_read_milli_per_mtok"),
    })
}

/// A3.19: milli-units are floor(p * 1000 + 0.5).
fn milli(usd_per_mtok: f64) -> i64 {
    (usd_per_mtok * 1000.0 + 0.5).floor() as i64
}

fn checks(value: Option<&Value>) -> Res<Vec<Check>> {
    let items = match value {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(Value::Array(items)) => items,
        Some(_) => return Err("checks must be a list".into()),
    };
    items
        .iter()
        .map(|item| {
            let map = object(item, "a check")?;
            let file = text(field(map, "file", "a check")?, "check.file")?;
            let contains = map.get("contains").map(|v| text(v, "check.contains")).transpose()?;
            let not_contains = map
                .get("not_contains")
                .map(|v| text(v, "check.not_contains"))
                .transpose()?;
            let lines = map.get("lines").map(|v| int(v, "check.lines")).transpose()?;
            Ok(Check {
                file,
                contains,
                not_contains,
                lines,
            })
        })
        .collect()
}

fn custom_tools(value: Option<&Value>) -> Res<Vec<CustomTool>> {
    let items = match value {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(Value::Array(items)) => items,
        Some(_) => return Err("custom_tools must be a list".into()),
    };
    items
        .iter()
        .map(|item| {
            let map = object(item, "a custom tool")?;
            if map.contains_key("server") != map.contains_key("version") {
                return Err("a custom tool names both server and version, or neither".into());
            }
            let results = match map.get("results") {
                None => Vec::new(),
                Some(Value::Array(list)) => list
                    .iter()
                    .map(|entry| {
                        let entry = object(entry, "a custom result")?;
                        let matches = match entry.get("match") {
                            None => Vec::new(),
                            Some(found) => object(found, "match")?
                                .iter()
                                .map(|(key, value)| (key.clone(), value.clone()))
                                .collect(),
                        };
                        Ok(CustomResult {
                            matches,
                            output: text(field(entry, "output", "a custom result")?, "output")?,
                            ok: entry.get("ok").and_then(Value::as_bool).unwrap_or(true),
                        })
                    })
                    .collect::<Res<Vec<_>>>()?,
                Some(_) => return Err("results must be a list".into()),
            };
            let default = map.get("default").map(|d| object(d, "default")).transpose()?;
            Ok(CustomTool {
                name: text(field(map, "name", "a custom tool")?, "name")?,
                description: text(field(map, "description", "a custom tool")?, "description")?,
                input_schema: field(map, "input_schema", "a custom tool")?.clone(),
                latency_ms: match map.get("latency_ms") {
                    Some(value) => int(value, "latency_ms")?,
                    None => 100,
                },
                results,
                default_output: default
                    .and_then(|d| d.get("output"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                default_ok: default
                    .and_then(|d| d.get("ok"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                effect: map.get("effect").and_then(Value::as_str).map(str::to_string),
                server: map.get("server").and_then(Value::as_str).map(str::to_string),
                version: map.get("version").and_then(Value::as_str).map(str::to_string),
                ledger: map.get("ledger").and_then(Value::as_str).map(str::to_string),
                lose_reply: map
                    .get("lose_reply")
                    .and_then(Value::as_array)
                    .map(|items| items.iter().filter_map(Value::as_i64).collect())
                    .unwrap_or_default(),
            })
        })
        .collect()
}

fn interrupt_of(value: Option<&Value>) -> Res<Option<(i64, bool)>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(found) => {
            let map = object(found, "interrupt")?;
            let turn = int(field(map, "turn", "interrupt")?, "interrupt.turn")?;
            let resume = map.get("resume").and_then(Value::as_bool).unwrap_or(false);
            Ok(Some((turn, resume)))
        }
    }
}

fn faults_of(value: Option<&Value>) -> Res<Vec<(i64, String)>> {
    let Some(Value::Array(items)) = value else {
        return Ok(Vec::new());
    };
    items
        .iter()
        .map(|item| {
            let map = object(item, "a fault")?;
            Ok((
                int(field(map, "percent", "a fault")?, "fault.percent")?,
                text(field(map, "type", "a fault")?, "fault.type")?,
            ))
        })
        .collect()
}

fn outage_of(value: Option<&Value>) -> Res<Option<Outage>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(found) => {
            let map = object(found, "outage")?;
            Ok(Some(Outage {
                from_ms: int(field(map, "from_ms", "outage")?, "from_ms")?,
                to_ms: int(field(map, "to_ms", "outage")?, "to_ms")?,
                kind: text(field(map, "type", "outage")?, "outage.type")?,
                retry_after_ms: match map.get("retry_after_ms") {
                    Some(value) => int(value, "retry_after_ms")?,
                    None => 0,
                },
            }))
        }
    }
}

pub struct Board {
    pub id: String,
    pub modules: Map<String, Value>,
}

pub fn load_board(path: &Path) -> Res<Board> {
    let root = read_json(path)?;
    let map = object(&root, "the board")?;
    Ok(Board {
        id: text(field(map, "id", "the board")?, "id")?,
        modules: object(field(map, "modules", "the board")?, "modules")?.clone(),
    })
}

pub fn load_facts(path: &Path) -> Res<Map<String, Value>> {
    let root = read_json(path)?;
    root.as_object()
        .cloned()
        .ok_or_else(|| "the facts file must be a JSON object".to_string())
}
