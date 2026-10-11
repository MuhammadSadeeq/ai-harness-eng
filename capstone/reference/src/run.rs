//! The run (ENGINE.md sections 7.1 and A1 to A19): sessions, guards, compaction, the control,
//! context, loop and errors wires, the permission, sandbox and input checks, the tools, caching,
//! verification, sub-agents, crash and resume, and the end of the run.

use crate::canon::{pyjson, tokens, trace_line};
use crate::prng::Rng;
use crate::script::{Ctx, Cursor, Produced, Step};
use crate::tape::{Board, CustomTool, Price, Res, Tape, LEVELS};
use crate::workspace::{self, Files};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};

const TOOLDEFS: &str = include_str!("../../../site/assets/sim/tooldefs.json");

#[derive(Clone, Default)]
struct Modules {
    turn_limit: Option<i64>,
    token_budget: Option<i64>,
    loop_window: Option<i64>,
    output_cap: Option<i64>,
    retry: Option<Retry>,
    breaker: Option<i64>,
    permissions: Option<Permissions>,
    sandbox: Option<Vec<String>>,
    verify_feedback: Option<i64>,
    close_books: bool,
    rules_file: bool,
    rules_override: Option<Vec<String>>,
    redact: Option<Vec<String>>,
    history_resend: bool,
    first_block_only: bool,
    compaction: Option<Compaction>,
    system_clock: bool,
    cache: bool,
    validate_inputs: bool,
    split_results: bool,
    effort: Option<String>,
    tool_overrides: BTreeMap<String, ToolOverride>,
    tool_search: Option<Vec<String>>,
    cost_attribution: bool,
    pristine_tests: bool,
    tool_pins: Option<BTreeMap<String, String>>,
    tool_retry: Option<i64>,
    idempotency: bool,
    durable_session: bool,
    progress_file: Option<String>,
    subagents: Option<SubCfg>,
    model: Option<String>,
    request_params: Vec<(String, Value)>,
    capability_check: bool,
}

/// The overrides of one tool's definition as sent (A9.1).
#[derive(Clone)]
struct ToolOverride {
    description: Option<String>,
    schema: Option<Value>,
}

#[derive(Clone)]
struct Retry {
    max_attempts: i64,
    base_ms: i64,
    cap_ms: i64,
    jitter_full: bool,
}

#[derive(Clone)]
struct Permissions {
    mode: String,
    rules: Vec<Rule>,
}

#[derive(Clone)]
struct Rule {
    decision: String,
    tool: String,
    matches: Vec<(String, String)>,
    reason: String,
}

#[derive(Clone)]
struct Compaction {
    threshold_percent: i64,
    keep: Vec<String>,
}

#[derive(Clone)]
struct SubCfg {
    forked: bool,
    max: i64,
    max_turns: i64,
}

fn int_param(params: &Map<String, Value>, key: &str) -> Res<i64> {
    params
        .get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("module parameter {key} must be an integer"))
}

fn params_of(modules: &Map<String, Value>, name: &str) -> Res<Option<Map<String, Value>>> {
    match modules.get(name) {
        None => Ok(None),
        Some(value) => value
            .as_object()
            .cloned()
            .map(Some)
            .ok_or_else(|| format!("module {name} must be an object")),
    }
}

fn parse_modules(modules: &Map<String, Value>) -> Res<Modules> {
    let params = |name: &str| params_of(modules, name);
    let mut out = Modules {
        history_resend: true,
        ..Modules::default()
    };
    if let Some(p) = params("turn_limit")? {
        out.turn_limit = Some(int_param(&p, "max_turns")?);
    }
    if let Some(p) = params("token_budget")? {
        out.token_budget = Some(int_param(&p, "max_tokens")?);
    }
    if let Some(p) = params("loop_detect")? {
        out.loop_window = Some(int_param(&p, "window")?);
    }
    if let Some(p) = params("output_cap")? {
        out.output_cap = Some(int_param(&p, "max_tokens")?);
    }
    if let Some(p) = params("retry")? {
        out.retry = Some(Retry {
            max_attempts: int_param(&p, "max_attempts")?,
            base_ms: int_param(&p, "base_ms")?,
            cap_ms: int_param(&p, "cap_ms")?,
            jitter_full: p.get("jitter").and_then(Value::as_str) == Some("full"),
        });
    }
    if let Some(p) = params("breaker")? {
        out.breaker = Some(int_param(&p, "threshold")?);
    }
    if let Some(p) = params("permissions")? {
        let mode = p.get("mode").and_then(Value::as_str).unwrap_or("allow").to_string();
        let rules = p
            .get("rules")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(parse_rule).collect::<Res<Vec<_>>>())
            .transpose()?
            .unwrap_or_default();
        out.permissions = Some(Permissions { mode, rules });
    }
    if let Some(p) = params("sandbox")? {
        let egress = p
            .get("egress")
            .and_then(Value::as_array)
            .map(|hosts| hosts.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default();
        out.sandbox = Some(egress);
    }
    if let Some(p) = params("verify_gate")? {
        out.verify_feedback = Some(int_param(&p, "max_feedback")?);
        out.pristine_tests = p.get("pristine_tests").and_then(Value::as_bool) == Some(true);
    }
    if let Some(p) = params("tool_overrides")? {
        for (name, value) in &p {
            let map = value.as_object().ok_or("a tool override must be an object")?;
            out.tool_overrides.insert(
                name.clone(),
                ToolOverride {
                    description: map.get("description").and_then(Value::as_str).map(str::to_string),
                    schema: map.get("input_schema").cloned(),
                },
            );
        }
    }
    if let Some(p) = params("tool_search")? {
        let always = p
            .get("always")
            .and_then(Value::as_array)
            .map(|names| names.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default();
        out.tool_search = Some(always);
    }
    out.cost_attribution = modules.contains_key("cost_attribution");
    if let Some(p) = params("tool_pins")? {
        let pins = p
            .get("pins")
            .and_then(Value::as_object)
            .map(|pins| {
                pins.iter()
                    .map(|(server, version)| (server.clone(), version.as_str().unwrap_or("").to_string()))
                    .collect()
            })
            .unwrap_or_default();
        out.tool_pins = Some(pins);
    }
    out.history_resend = match params("history")? {
        None => true,
        Some(p) => match p.get("resend") {
            None => true,
            Some(Value::Bool(flag)) => *flag,
            Some(_) => return Err("history.resend must be true or false".into()),
        },
    };
    out.first_block_only = modules.contains_key("first_block_only");
    out.close_books = modules.contains_key("close_books");
    out.rules_file = modules.contains_key("rules_file");
    if let Some(p) = params("rules_file")? {
        if let Some(rules) = p.get("rules") {
            let list = rules.as_array().ok_or("rules_file.rules must be a list")?;
            if list.iter().any(|r| r.as_str().map(str::is_empty).unwrap_or(true)) {
                return Err("rules_file.rules holds non-empty strings".into());
            }
            out.rules_override = Some(list.iter().filter_map(Value::as_str).map(str::to_string).collect());
        }
    }
    if let Some(p) = params("compaction")? {
        let threshold = int_param(&p, "threshold_percent")?;
        if !(1..=100).contains(&threshold) {
            return Err("compaction.threshold_percent must be 1 to 100".into());
        }
        let keep = p
            .get("keep")
            .and_then(Value::as_array)
            .ok_or("compaction.keep is required (a list of note kinds)")?
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect();
        out.compaction = Some(Compaction {
            threshold_percent: threshold,
            keep,
        });
    }
    out.system_clock = modules.contains_key("system_clock");
    out.cache = modules.contains_key("cache");
    out.validate_inputs = modules.contains_key("validate_inputs");
    out.split_results = modules.contains_key("split_results");
    if let Some(p) = params("effort")? {
        let level = p
            .get("level")
            .and_then(Value::as_str)
            .ok_or("effort.level must be a level name")?;
        if !LEVELS.contains(&level) {
            return Err(format!("unknown effort level {level}"));
        }
        out.effort = Some(level.to_string());
    }
    if let Some(p) = params("redact")? {
        let patterns = p
            .get("patterns")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default();
        out.redact = Some(patterns);
    }
    if let Some(p) = params("tool_retry")? {
        out.tool_retry = Some(int_param(&p, "max_attempts")?);
    }
    out.idempotency = modules.contains_key("idempotency");
    out.durable_session = modules.contains_key("durable_session");
    if let Some(p) = params("progress_file")? {
        out.progress_file = Some(
            p.get("path")
                .and_then(Value::as_str)
                .ok_or("progress_file.path must be a path")?
                .to_string(),
        );
    }
    if let Some(p) = params("subagents")? {
        out.subagents = Some(SubCfg {
            forked: p.get("context").and_then(Value::as_str) == Some("forked"),
            max: int_param(&p, "max")?,
            max_turns: int_param(&p, "max_turns")?,
        });
    }
    if let Some(p) = params("model")? {
        out.model = Some(
            p.get("id")
                .and_then(Value::as_str)
                .ok_or("model.id must be a model id")?
                .to_string(),
        );
    }
    if let Some(p) = params("request_params")? {
        out.request_params = p.iter().map(|(name, value)| (name.clone(), value.clone())).collect();
    }
    out.capability_check = modules.contains_key("capability_check");
    Ok(out)
}

fn parse_rule(value: &Value) -> Res<Rule> {
    let map = value.as_object().ok_or("a permission rule must be an object")?;
    let matches = map
        .get("match")
        .and_then(Value::as_object)
        .map(|fields| {
            fields
                .iter()
                .map(|(key, glob)| (key.clone(), glob.as_str().unwrap_or("").to_string()))
                .collect()
        })
        .unwrap_or_default();
    Ok(Rule {
        decision: map.get("decision").and_then(Value::as_str).unwrap_or("allow").to_string(),
        tool: map.get("tool").and_then(Value::as_str).unwrap_or("*").to_string(),
        matches,
        reason: map.get("reason").and_then(Value::as_str).unwrap_or("").to_string(),
    })
}

/// The modules a sub-agent runs with (A15.1, A16.4): the ones it names, and its own turn limit.
fn for_subagent(m: &Modules) -> Modules {
    Modules {
        turn_limit: None,
        token_budget: None,
        loop_window: None,
        verify_feedback: None,
        close_books: false,
        rules_file: false,
        rules_override: None,
        history_resend: true,
        first_block_only: false,
        compaction: None,
        system_clock: false,
        cache: false,
        split_results: false,
        tool_search: None,
        pristine_tests: false,
        durable_session: false,
        progress_file: None,
        subagents: None,
        ..m.clone()
    }
}

#[derive(Clone)]
struct Call {
    id: String,
    name: String,
    input: Value,
}

struct Reply {
    content: Vec<Value>,
    say: String,
    calls: Vec<Call>,
    stop: String,
    latency_ms: Option<i64>,
}

struct Failure {
    kind: String,
    message: String,
    error_ms: i64,
    retry_after_ms: i64,
}

struct Parts {
    layers: Vec<&'static str>,
    body: Value,
}

struct CacheInfo {
    read: i64,
    write: i64,
    uncached: i64,
    matched: String,
    hit_percent: i64,
}

/// One loop's own state: the main agent across the sessions, or a sub-agent (A15, A17.5).
struct Agent {
    label: String,
    prefix: String,
    sub: bool,
    turn: i64,
    session: i64,
    session_turns: i64,
    messages: Vec<Value>,
    cursor: Cursor,
    script_start: Vec<Step>,
    system: String,
    recent_calls: Vec<String>,
    consecutive_failures: i64,
    feedback_count: i64,
    last_permission: Option<String>,
    last_truncated: bool,
    progress: Option<String>,
    last_sent: Vec<Value>,
    last_text: String,
}

impl Agent {
    fn new_main(system: String, script: Vec<Step>) -> Agent {
        Agent {
            label: "main".into(),
            prefix: String::new(),
            sub: false,
            turn: 0,
            session: 1,
            session_turns: 0,
            messages: Vec::new(),
            cursor: Cursor::new(script.clone()),
            script_start: script,
            system,
            recent_calls: Vec::new(),
            consecutive_failures: 0,
            feedback_count: 0,
            last_permission: None,
            last_truncated: false,
            progress: None,
            last_sent: Vec::new(),
            last_text: String::new(),
        }
    }

    fn new_sub(k: i64, name: &str, system: String, script: Vec<Step>, messages: Vec<Value>) -> Agent {
        Agent {
            label: format!("{name}#{k}"),
            prefix: format!("a{k}_"),
            sub: true,
            turn: 0,
            session: 1,
            session_turns: 0,
            messages,
            cursor: Cursor::new(script.clone()),
            script_start: script,
            system,
            recent_calls: Vec::new(),
            consecutive_failures: 0,
            feedback_count: 0,
            last_permission: None,
            last_truncated: false,
            progress: None,
            last_sent: Vec::new(),
            last_text: String::new(),
        }
    }
}

fn user_text(text: &str) -> Value {
    json!({"role": "user", "content": [{"type": "text", "text": text}]})
}

fn tool_result(id: &str, content: &str, is_error: bool) -> Value {
    json!({"type": "tool_result", "tool_use_id": id, "content": content, "is_error": is_error})
}

fn message_for(kind: &str) -> String {
    match kind {
        "overloaded" => "Overloaded",
        "rate_limit" => "Rate limited",
        "api_error" => "Internal server error",
        "timeout" => "Request timed out",
        "invalid_request" => "Invalid request",
        other => other,
    }
    .to_string()
}

fn transient(kind: &str) -> bool {
    matches!(kind, "overloaded" | "rate_limit" | "api_error" | "timeout")
}

fn failure(kind: &str, error_ms: i64, retry_after_ms: i64) -> Failure {
    Failure {
        kind: kind.to_string(),
        message: message_for(kind),
        error_ms,
        retry_after_ms,
    }
}

/// The statuses after which the next session takes over (A14.2).
fn hands_over(status: &str) -> bool {
    matches!(status, "done" | "max_turns" | "unverified")
}

pub struct Run<'a> {
    tape: &'a Tape,
    board_id: String,
    modules: Modules,
    sub_modules: Modules,
    builtin: Vec<Value>,
    seed: i64,
    rng: Rng,
    pub events: Vec<String>,
    pub wire: Vec<String>,
    seq: i64,
    t: i64,
    since_trace: i64,
    redacted: i64,
    files: Files,
    tokens_in: i64,
    tokens_out: i64,
    cost: i64,
    asks: i64,
    cache_map: BTreeMap<String, i64>,
    loaded: BTreeSet<String>,
    rejected: BTreeSet<String>,
    rejections: Vec<(String, String, String, String)>,
    agent: Agent,
    model_id: String,
    price: Price,
    rejects: Vec<String>,
    params: Vec<(String, Value)>,
    dropped: Vec<String>,
    main_script: Vec<Step>,
    subs_started: i64,
    keys: BTreeMap<(String, String), String>,
    applied: BTreeMap<String, i64>,
    crashed: bool,
    last_attempts: i64,
}

impl<'a> Run<'a> {
    pub fn new(tape: &'a Tape, board: &Board, seed: i64) -> Res<Run<'a>> {
        let builtin: Vec<Value> =
            serde_json::from_str(TOOLDEFS).map_err(|error| format!("tooldefs.json: {error}"))?;
        let modules = parse_modules(&board.modules)?;
        let custom_names: Vec<&str> = tape.custom_tools.iter().map(|t| t.name.as_str()).collect();
        let known = |name: &str| custom_names.contains(&name) || tape.tools.iter().any(|t| t == name);
        for name in modules.tool_overrides.keys() {
            if !known(name) {
                return Err(format!("tool_overrides names {name}, which the tape does not have"));
            }
        }
        if let Some(always) = &modules.tool_search {
            if let Some(name) = always.iter().find(|name| !known(name)) {
                return Err(format!("tool_search.always names {name}, which the tape does not have"));
            }
            if tape.tools.iter().any(|t| t == "tool_search") || custom_names.contains(&"tool_search") {
                return Err("a tape that defines its own tool_search is refused (A10.2)".into());
            }
        }
        // A14.5: the board's model profile sets the model, the prices, the rejects and the script.
        let (model_id, price, rejects, main_script) = match &modules.model {
            None => (
                tape.model_id.clone(),
                tape.price,
                Vec::new(),
                tape.script.clone(),
            ),
            Some(id) => {
                let profile = tape
                    .models
                    .get(id)
                    .ok_or_else(|| format!("the board's model {id} is not a key of the tape's models"))?;
                let script = profile.script.clone().unwrap_or_else(|| tape.script.clone());
                (id.clone(), profile.price, profile.rejects.clone(), script)
            }
        };
        if modules.cache
            && (tape.cache_rules.is_none() || price.cache_write_milli.is_none() || price.cache_read_milli.is_none())
        {
            return Err("the board has cache, but the tape has no cache_rules or cache prices (A8.5)".into());
        }
        let dropped: Vec<String> = if modules.capability_check {
            modules
                .request_params
                .iter()
                .filter(|(name, _)| rejects.contains(name))
                .map(|(name, _)| name.clone())
                .collect()
        } else {
            Vec::new()
        };
        // A11.5: a custom tool from a server that is not pinned at its version is rejected.
        let mut rejected = BTreeSet::new();
        let mut rejections = Vec::new();
        if let Some(pins) = &modules.tool_pins {
            for custom in &tape.custom_tools {
                let (Some(server), Some(version)) = (&custom.server, &custom.version) else {
                    continue;
                };
                let reason = match pins.get(server) {
                    None => format!("server not pinned: {server}"),
                    Some(pin) if pin != version => format!("version {version} is not the pinned {pin}"),
                    Some(_) => continue,
                };
                rejected.insert(custom.name.clone());
                rejections.push((custom.name.clone(), server.clone(), version.clone(), reason));
            }
        }
        let loaded: BTreeSet<String> = modules.tool_search.clone().unwrap_or_default().into_iter().collect();
        let sub_modules = for_subagent(&modules);
        let params = modules.request_params.clone();
        Ok(Run {
            tape,
            board_id: board.id.clone(),
            modules,
            sub_modules,
            builtin,
            seed,
            rng: Rng::new(seed as u32),
            events: Vec::new(),
            wire: Vec::new(),
            seq: 0,
            t: 0,
            since_trace: 0,
            redacted: 0,
            files: tape.files.clone(),
            tokens_in: 0,
            tokens_out: 0,
            cost: 0,
            asks: 0,
            cache_map: BTreeMap::new(),
            loaded,
            rejected,
            rejections,
            agent: Agent::new_main(tape.system.clone(), main_script.clone()),
            model_id: model_id.clone(),
            price,
            rejects: rejects.clone(),
            params,
            dropped,
            main_script,
            subs_started: 0,
            keys: BTreeMap::new(),
            applied: BTreeMap::new(),
            crashed: false,
            last_attempts: 1,
        })
    }

    /// The modules of the loop that runs now: the main agent's, or a sub-agent's (A15.1).
    fn mods(&self) -> Modules {
        if self.agent.sub {
            self.sub_modules.clone()
        } else {
            self.modules.clone()
        }
    }

    fn emit(&mut self, kind: &str, wire: &str, fields: Vec<(&str, Value)>) -> Res<()> {
        let m = self.mods();
        let mut event = Map::new();
        event.insert("v".into(), json!(1));
        event.insert("run".into(), json!(format!("{}:{}:{}", self.tape.id, self.board_id, self.seed)));
        event.insert("seq".into(), json!(self.seq));
        event.insert("t".into(), json!(self.t));
        event.insert("turn".into(), json!(self.agent.turn));
        event.insert("agent".into(), json!(self.agent.label));
        event.insert("kind".into(), json!(kind));
        event.insert("wire".into(), json!(wire));
        for (key, mut value) in fields {
            if let Some(patterns) = m.redact.clone() {
                self.redacted += redact(&mut value, &patterns);
            }
            event.insert(key.to_string(), value);
        }
        self.events.push(trace_line(&Value::Object(event))?);
        self.seq += 1;
        self.since_trace += 1;
        Ok(())
    }

    fn trace_write(&mut self) -> Res<()> {
        let (events, redacted) = (self.since_trace, self.redacted);
        self.emit(
            "trace_write",
            "observe",
            vec![("events", json!(events)), ("redacted", json!(redacted))],
        )?;
        self.since_trace = 0;
        self.redacted = 0;
        Ok(())
    }

    fn end(&mut self, status: &str) -> Res<String> {
        if self.since_trace > 0 {
            self.trace_write()?;
        }
        let passed = workspace::checks_hold(self.tape, &self.files);
        let tokens = json!({"input": self.tokens_in, "output": self.tokens_out});
        self.emit(
            "run_end",
            "loop",
            vec![
                ("status", json!(status)),
                ("passed", json!(passed)),
                ("turns", json!(self.agent.turn)),
                ("tokens", tokens),
                ("cost", json!(self.cost)),
            ],
        )?;
        Ok(status.to_string())
    }

    fn guard(&mut self, guard: &str, limit: i64, value: i64) -> Res<()> {
        self.emit(
            "guard",
            "loop",
            vec![("guard", json!(guard)), ("limit", json!(limit)), ("value", json!(value))],
        )
    }

    fn loop_detected(&self, window: i64) -> bool {
        let window = window.max(2) as usize;
        let calls = &self.agent.recent_calls;
        if calls.len() < window {
            return false;
        }
        let last = &calls[calls.len() - window..];
        last.iter().all(|call| call == &last[0])
    }

    pub fn execute(&mut self) -> Res<String> {
        let m = self.mods();
        self.emit(
            "run_start",
            "loop",
            vec![
                ("task", json!(self.tape.task)),
                ("board", json!(self.board_id)),
                ("seed", json!(self.seed)),
                ("model_id", json!(self.model_id)),
            ],
        )?;
        for (tool, server, version, reason) in self.rejections.clone() {
            self.emit(
                "tool_rejected",
                "tools",
                vec![
                    ("tool", json!(tool)),
                    ("server", json!(server)),
                    ("version", json!(version)),
                    ("reason", json!(reason)),
                ],
            )?;
        }
        if m.capability_check {
            self.emit("capability", "control", vec![("dropped", json!(self.dropped))])?;
        }
        let sessioned = !self.tape.sessions.is_empty();
        let scripts: Vec<Vec<Step>> = if sessioned {
            self.tape.sessions.clone()
        } else {
            vec![self.main_script.clone()]
        };
        let mut status = String::new();
        for (index, script) in scripts.iter().enumerate() {
            self.agent.session = index as i64 + 1;
            self.agent.session_turns = 0;
            self.agent.cursor = Cursor::new(script.clone());
            self.agent.script_start = script.clone();
            self.agent.messages = vec![user_text(&self.tape.task)];
            self.agent.recent_calls.clear();
            self.agent.consecutive_failures = 0;
            self.agent.feedback_count = 0;
            if sessioned {
                let session = self.agent.session;
                self.emit("session_start", "context", vec![("session", json!(session))])?;
            }
            if index >= 1 {
                if let Some(path) = &m.progress_file {
                    self.agent.progress = workspace::read_text(&self.files, path);
                }
            }
            status = self.main_loop()?;
            if index + 1 < scripts.len() && hands_over(&status) {
                continue;
            }
            break;
        }
        self.end(&status)
    }

    /// The loop of the main agent: turns until the run (or the session) ends; returns the status.
    fn main_loop(&mut self) -> Res<String> {
        loop {
            let m = self.mods();
            if let Some(max) = m.turn_limit {
                if self.agent.session_turns >= max {
                    self.guard("max_turns", max, self.agent.session_turns)?;
                    return Ok("max_turns".into());
                }
            }
            if let Some(max) = m.token_budget {
                let used = self.tokens_in + self.tokens_out;
                if used >= max {
                    self.guard("budget", max, used)?;
                    return Ok("budget".into());
                }
            }
            if let Some(window) = m.loop_window {
                if self.loop_detected(window) {
                    self.guard("loop", window, window)?;
                    return Ok("loop".into());
                }
            }
            if self.agent.turn >= 60 {
                self.emit(
                    "interrupt",
                    "loop",
                    vec![("by", json!("operator")), ("pending", json!([]))],
                )?;
                return Ok("interrupted".into());
            }
            self.agent.turn += 1;
            self.agent.session_turns += 1;

            let compacted = self.compact()?;
            let parts = self.request_parts();
            let prompt_tokens = tokens(&parts.body)?;
            self.emit(
                "prompt_built",
                "control",
                vec![("layers", json!(parts.layers)), ("tokens", json!(prompt_tokens))],
            )?;

            let window = self.tape.window;
            let over = prompt_tokens > window;
            let percent = 100 * prompt_tokens / window;
            let action = if over {
                "overflow"
            } else if compacted {
                "compacted"
            } else {
                "none"
            };
            self.emit(
                "context_check",
                "context",
                vec![
                    ("tokens", json!(prompt_tokens)),
                    ("window", json!(window)),
                    ("percent", json!(percent)),
                    ("action", json!(action)),
                ],
            )?;
            if over {
                let message = format!("prompt is too long: {prompt_tokens} tokens > {window} maximum");
                return self.permanent_error(prompt_tokens, &message);
            }
            if self.missing_result_error() {
                let message = "tool_use ids were found without tool_result blocks immediately after";
                return self.permanent_error(prompt_tokens, message);
            }
            if let Some(message) = self.rejected_param() {
                return self.permanent_error(prompt_tokens, &message);
            }

            let reply = match self.call_until_reply(&parts, prompt_tokens)? {
                Ok(reply) => reply,
                Err(status) => return Ok(status),
            };
            let breaker = if m.breaker.is_some() { "closed" } else { "none" };
            let attempts = self.last_attempts;
            self.emit(
                "recovery_check",
                "errors",
                vec![("attempts", json!(attempts)), ("breaker", json!(breaker))],
            )?;

            let cache_info = if m.cache {
                Some(self.cache_step(&parts.body, prompt_tokens)?)
            } else {
                None
            };
            if let Some(info) = &cache_info {
                self.emit(
                    "cache",
                    "context",
                    vec![
                        ("read", json!(info.read)),
                        ("write", json!(info.write)),
                        ("uncached", json!(info.uncached)),
                        ("matched", json!(info.matched)),
                        ("hit_percent", json!(info.hit_percent)),
                    ],
                )?;
            }
            self.agent.last_sent = parts.body["messages"].as_array().cloned().unwrap_or_default();
            let (stop, tool_uses, read_count) = self.account_reply(&reply, &parts, prompt_tokens, cache_info.as_ref())?;

            if let Some((turn, resume)) = self.tape.interrupt {
                if turn == self.agent.turn && read_count > 0 {
                    let pending: Vec<Value> = reply.calls.iter().take(read_count).map(|c| json!(c.id)).collect();
                    self.emit(
                        "interrupt",
                        "loop",
                        vec![("by", json!("human")), ("pending", json!(pending))],
                    )?;
                    if m.close_books {
                        let answers: Vec<Value> = reply
                            .calls
                            .iter()
                            .take(read_count)
                            .map(|c| tool_result(&c.id, "Interrupted by the user before this ran.", true))
                            .collect();
                        self.agent.messages.push(json!({"role": "user", "content": answers}));
                    }
                    if !resume {
                        return Ok("interrupted".into());
                    }
                    self.trace_write()?;
                    continue;
                }
            }
            let _ = tool_uses;

            let branch = if m.first_block_only && stop == "tool_use" && read_count == 0 {
                "end_turn".to_string()
            } else {
                stop.clone()
            };
            match branch.as_str() {
                "tool_use" => {
                    self.tool_branch(&reply.calls[..read_count])?;
                    self.crash_check()?;
                    continue;
                }
                "end_turn" => {
                    if let Some(max_feedback) = m.verify_feedback {
                        let pristine = m.pristine_tests && !self.tape.tests.is_empty();
                        let passed = workspace::tests_pass(self.tape, &self.files, pristine);
                        let output = if passed {
                            self.tape.test_pass.clone()
                        } else {
                            self.tape.test_fail.clone()
                        };
                        let check = if pristine { "tests (pristine)" } else { "tests" };
                        self.emit(
                            "verify",
                            "verify",
                            vec![
                                ("check", json!(check)),
                                ("passed", json!(passed)),
                                ("output", json!(output)),
                            ],
                        )?;
                        if passed {
                            return Ok("done".into());
                        }
                        if self.agent.feedback_count < max_feedback {
                            self.agent.feedback_count += 1;
                            self.agent.messages.push(user_text(&format!(
                                "Verification failed: {} Fix it, then say done.",
                                self.tape.test_fail
                            )));
                            self.trace_write()?;
                            continue;
                        }
                        return Ok("unverified".into());
                    }
                    return Ok("done".into());
                }
                "max_tokens" => return Ok("max_tokens_reply".into()),
                "refusal" => return Ok("refused".into()),
                _ => return Ok("error".into()),
            }
        }
    }

    /// A14.3: after turn n's results are recorded, the crash; then a restart (or a resume).
    fn crash_check(&mut self) -> Res<()> {
        let Some(turn) = self.tape.crash else {
            return Ok(());
        };
        if self.crashed || self.agent.turn != turn {
            return Ok(());
        }
        self.crashed = true;
        self.emit("crash", "loop", vec![("turn", json!(turn))])?;
        if self.mods().durable_session {
            self.emit("resume", "loop", vec![("from_turn", json!(turn + 1))])?;
        } else {
            self.agent.messages = vec![user_text(&self.tape.task)];
            self.agent.cursor = Cursor::new(self.agent.script_start.clone());
        }
        Ok(())
    }

    /// The loop of a sub-agent (A14.1, A15): its own turns up to max_turns; returns its status.
    fn sub_loop(&mut self, max_turns: i64) -> Res<String> {
        loop {
            let m = self.mods();
            if self.agent.session_turns >= max_turns {
                self.guard("max_turns", max_turns, self.agent.turn)?;
                return Ok("max_turns".into());
            }
            self.agent.turn += 1;
            self.agent.session_turns += 1;
            let parts = self.request_parts();
            let prompt_tokens = tokens(&parts.body)?;
            self.emit(
                "prompt_built",
                "control",
                vec![("layers", json!(parts.layers)), ("tokens", json!(prompt_tokens))],
            )?;
            let window = self.tape.window;
            let over = prompt_tokens > window;
            let percent = 100 * prompt_tokens / window;
            self.emit(
                "context_check",
                "context",
                vec![
                    ("tokens", json!(prompt_tokens)),
                    ("window", json!(window)),
                    ("percent", json!(percent)),
                    ("action", json!(if over { "overflow" } else { "none" })),
                ],
            )?;
            if over {
                let message = format!("prompt is too long: {prompt_tokens} tokens > {window} maximum");
                return self.permanent_error(prompt_tokens, &message).map(|_| "error".to_string());
            }
            if self.missing_result_error() {
                let message = "tool_use ids were found without tool_result blocks immediately after";
                return self.permanent_error(prompt_tokens, message).map(|_| "error".to_string());
            }
            if let Some(message) = self.rejected_param() {
                return self.permanent_error(prompt_tokens, &message).map(|_| "error".to_string());
            }
            let reply = match self.call_until_reply(&parts, prompt_tokens)? {
                Ok(reply) => reply,
                Err(status) => return Ok(status),
            };
            let breaker = if m.breaker.is_some() { "closed" } else { "none" };
            let attempts = self.last_attempts;
            self.emit(
                "recovery_check",
                "errors",
                vec![("attempts", json!(attempts)), ("breaker", json!(breaker))],
            )?;
            self.agent.last_sent = parts.body["messages"].as_array().cloned().unwrap_or_default();
            let (stop, _, read_count) = self.account_reply(&reply, &parts, prompt_tokens, None)?;
            self.agent.last_text = reply
                .content
                .iter()
                .filter(|block| block["type"] == "text")
                .filter_map(|block| block["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n");
            match stop.as_str() {
                "tool_use" => {
                    self.tool_branch(&reply.calls[..read_count])?;
                    continue;
                }
                "end_turn" => return Ok("done".into()),
                "max_tokens" => return Ok("max_tokens_reply".into()),
                "refusal" => return Ok("refused".into()),
                _ => return Ok("error".into()),
            }
        }
    }

    /// The shared model call with recovery (A3.14, §7.1, §7.3): Ok(reply), or Err with the status
    /// the loop ends with (error, circuit_open). Sets last_attempts.
    fn call_until_reply(&mut self, parts: &Parts, prompt_tokens: i64) -> Res<Result<Reply, String>> {
        let m = self.mods();
        let mut attempt = 0;
        loop {
            attempt += 1;
            self.emit(
                "model_call",
                "loop",
                vec![("attempt", json!(attempt)), ("tokens_in", json!(prompt_tokens))],
            )?;
            let ctx = self.conditions(&parts.body, prompt_tokens);
            match self.call_model(&ctx)? {
                Ok(reply) => {
                    self.agent.consecutive_failures = 0;
                    self.last_attempts = attempt;
                    return Ok(Ok(reply));
                }
                Err(failure) => {
                    self.t += failure.error_ms;
                    self.agent.consecutive_failures += 1;
                    self.emit(
                        "model_error",
                        "errors",
                        vec![
                            ("type", json!(failure.kind)),
                            ("attempt", json!(attempt)),
                            ("retry_after_ms", json!(failure.retry_after_ms)),
                            ("message", json!(failure.message)),
                        ],
                    )?;
                    if let Some(threshold) = m.breaker {
                        if self.agent.consecutive_failures >= threshold {
                            self.emit(
                                "breaker",
                                "errors",
                                vec![
                                    ("state", json!("open")),
                                    ("failures", json!(self.agent.consecutive_failures)),
                                ],
                            )?;
                            return Ok(Err("circuit_open".into()));
                        }
                    }
                    if let Some(retry) = &m.retry {
                        if attempt < retry.max_attempts && transient(&failure.kind) {
                            let wait = self.backoff(&retry.clone(), attempt, failure.retry_after_ms);
                            self.emit(
                                "retry_wait",
                                "errors",
                                vec![("attempt", json!(attempt)), ("wait_ms", json!(wait))],
                            )?;
                            self.t += wait;
                            continue;
                        }
                    }
                    return Ok(Err("error".into()));
                }
            }
        }
    }

    /// The reply's accounting (A7.3, A6.5, A9.4): output tokens with thinking, latency, tokens and
    /// cost, the wire pair, the assistant message, model_reply and cost. Returns the stop reason,
    /// the tool uses, and how many calls the harness read.
    fn account_reply(
        &mut self,
        reply: &Reply,
        parts: &Parts,
        prompt_tokens: i64,
        cache: Option<&CacheInfo>,
    ) -> Res<(String, Value, usize)> {
        let m = self.mods();
        let thinking = self.thinking_tokens();
        let output_tokens = tokens(&Value::Array(reply.content.clone()))? + thinking;
        let latency = reply.latency_ms.unwrap_or(600 + 20 * output_tokens);
        self.t += latency;
        self.tokens_in += prompt_tokens;
        self.tokens_out += output_tokens;
        let price = self.price;
        let (input_cost, cache_cost) = match cache {
            None => (prompt_tokens * price.input_milli, 0),
            Some(info) => (
                info.uncached * price.input_milli,
                info.write * price.cache_write_milli.unwrap_or(0)
                    + info.read * price.cache_read_milli.unwrap_or(0),
            ),
        };
        let output_cost = output_tokens * price.output_milli;
        self.cost += input_cost + output_cost + cache_cost;
        let usage = self.usage(prompt_tokens, output_tokens, cache, thinking);
        let stop = reply.stop.clone();
        let tool_uses: Vec<Value> = reply
            .calls
            .iter()
            .map(|call| json!({"id": call.id, "name": call.name, "input": call.input}))
            .collect();
        let read_count = if !m.first_block_only {
            reply.calls.len()
        } else {
            usize::from(reply.content.first().map(|b| b["type"] == "tool_use") == Some(true))
        };
        self.wire_pair(&parts.body, reply, &usage, cache.is_some())?;
        self.agent
            .messages
            .push(json!({"role": "assistant", "content": reply.content}));
        self.emit(
            "model_reply",
            "loop",
            vec![
                ("stop_reason", json!(stop)),
                ("text", json!(reply.say)),
                ("tool_uses", json!(tool_uses)),
                ("usage", usage),
                ("cost", json!(self.cost)),
            ],
        )?;
        if m.cost_attribution {
            let (top_part, top_tokens) = top_part(&parts.body)?;
            self.emit(
                "cost",
                "observe",
                vec![
                    ("call_cost", json!(input_cost + output_cost + cache_cost)),
                    ("input_cost", json!(input_cost)),
                    ("output_cost", json!(output_cost)),
                    ("cache_cost", json!(cache_cost)),
                    ("top_part", json!(top_part)),
                    ("top_tokens", json!(top_tokens)),
                ],
            )?;
        }
        Ok((stop, json!(tool_uses), read_count))
    }

    /// The tool branch (§7.1): permission, sandbox, input check, run, cap, tool_call and leak for
    /// each call, then the results in one user message (or one per result, A7.2).
    fn tool_branch(&mut self, calls: &[Call]) -> Res<()> {
        let m = self.mods();
        let mut results = Vec::new();
        for call in calls {
            let (decision, rule, reason) = self.policy(call);
            let (human, final_decision) = if decision == "ask" {
                let answer = self.simulated_human(call);
                let final_decision = if answer == "approve" { "allow" } else { "deny" };
                (Some(answer.clone()), final_decision.to_string())
            } else {
                (None, decision.clone())
            };
            self.emit(
                "permission",
                "permissions",
                vec![
                    ("tool", json!(call.name)),
                    ("decision", json!(decision)),
                    ("rule", json!(rule)),
                    ("reason", json!(reason)),
                    ("human", json!(human)),
                    ("final", json!(final_decision)),
                    ("tool_use_id", json!(call.id)),
                ],
            )?;
            self.agent.last_permission = Some(final_decision.clone());
            if final_decision == "deny" {
                results.push(tool_result(&call.id, &format!("Denied: {reason}"), true));
                continue;
            }
            if let Some(egress) = m.sandbox.clone() {
                let (allowed, why) = self.sandbox_check(call, &egress);
                self.emit(
                    "sandbox",
                    "permissions",
                    vec![
                        ("tool", json!(call.name)),
                        ("allowed", json!(allowed)),
                        ("reason", json!(why)),
                        ("tool_use_id", json!(call.id)),
                    ],
                )?;
                if !allowed {
                    results.push(tool_result(&call.id, &format!("Blocked by the sandbox: {why}"), true));
                    continue;
                }
            }
            if m.validate_inputs {
                let problem = self.input_problem(call);
                self.emit(
                    "input_check",
                    "tools",
                    vec![
                        ("tool", json!(call.name)),
                        ("valid", json!(problem.is_none())),
                        ("reason", json!(problem.clone().unwrap_or_default())),
                        ("tool_use_id", json!(call.id)),
                    ],
                )?;
                if let Some(reason) = problem {
                    results.push(tool_result(&call.id, &format!("Invalid input: {reason}"), true));
                    continue;
                }
            }
            // tool_retry (A14.4): a result that starts "Timed out" runs again, at once, not run_agent.
            let mut attempt = 1;
            loop {
                let done = self.run_tool(call)?;
                let (shown, truncated) = self.cap(&done.output)?;
                self.t += done.latency_ms;
                let mut fields = vec![
                    ("tool", json!(call.name)),
                    ("input", call.input.clone()),
                    ("ok", json!(done.ok)),
                    ("output", json!(shown)),
                    ("output_tokens", json!(tokens(&json!(shown))?)),
                    ("truncated", json!(truncated)),
                    ("tool_use_id", json!(call.id)),
                ];
                if m.tool_retry.is_some() {
                    fields.push(("attempt", json!(attempt)));
                }
                self.emit("tool_call", "tools", fields)?;
                self.agent.last_truncated = truncated;
                let retryable = done.output.starts_with("Timed out") && call.name != "run_agent";
                if let Some(max) = m.tool_retry {
                    if retryable && attempt < max {
                        attempt += 1;
                        continue;
                    }
                }
                results.push(tool_result(&call.id, &shown, !done.ok));
                break;
            }
            self.emit_leak(call)?;
            self.agent.recent_calls.push(format!("{} {}", call.name, pyjson(&call.input)?));
        }
        if m.split_results {
            for result in results {
                self.agent.messages.push(json!({"role": "user", "content": [result]}));
            }
        } else {
            self.agent.messages.push(json!({"role": "user", "content": results}));
        }
        self.trace_write()
    }

    fn permanent_error(&mut self, prompt_tokens: i64, message: &str) -> Res<String> {
        self.emit(
            "model_call",
            "loop",
            vec![("attempt", json!(1)), ("tokens_in", json!(prompt_tokens))],
        )?;
        self.t += 300;
        self.emit(
            "model_error",
            "errors",
            vec![
                ("type", json!("invalid_request")),
                ("attempt", json!(1)),
                ("retry_after_ms", json!(0)),
                ("message", json!(message)),
            ],
        )?;
        Ok("error".into())
    }

    /// A14.5: a request parameter the model rejects, without capability_check, fails the call.
    fn rejected_param(&self) -> Option<String> {
        if self.mods().capability_check {
            return None;
        }
        self.params
            .iter()
            .find(|(name, _)| self.rejects.contains(name))
            .map(|(name, _)| format!("{name}: this parameter is not supported on {}", self.model_id))
    }

    /// The control wire's request: the layers, the system text, the tools and the sent messages.
    fn request_parts(&self) -> Parts {
        let m = self.mods();
        if self.agent.sub {
            let tools: Vec<Value> = self.sub_tools();
            let body = json!({
                "system": self.agent.system,
                "tools": tools,
                "messages": self.sent_messages(),
            });
            return Parts {
                layers: vec!["system", "tools", "history"],
                body,
            };
        }
        let rules: &[String] = m.rules_override.as_deref().unwrap_or(self.tape.rules.as_slice());
        let rules_on = m.rules_file && !rules.is_empty();
        let progress = self.agent.progress.clone().filter(|_| m.progress_file.is_some());
        let mut layers: Vec<&'static str> = Vec::new();
        if m.system_clock {
            layers.push("clock");
        }
        layers.push("system");
        if rules_on {
            layers.push("rules");
        }
        if progress.is_some() {
            layers.push("progress");
        }
        layers.push("tools");
        layers.push(if m.history_resend {
            "history"
        } else {
            "history (not resent)"
        });
        let mut system = self.tape.system.clone();
        if rules_on {
            system = format!("{system}\n\nProject rules:\n- {}", rules.join("\n- "));
        }
        if let (Some(path), Some(content)) = (&m.progress_file, &progress) {
            system = format!("{system}\n\nProgress so far (from {path}):\n{content}");
        }
        if m.system_clock {
            system = format!("Current time: t={} ms\n\n{system}", self.t);
        }
        let tools = self.request_tools();
        let body = json!({"system": system, "tools": tools, "messages": self.sent_messages()});
        Parts { layers, body }
    }

    /// Every tool that has a definition, in A3.1 order: the built-ins the tape names (tooldefs.json
    /// order), then the custom tools (tape order).
    fn all_tool_names(&self) -> Vec<String> {
        let mut names: Vec<String> = self
            .builtin
            .iter()
            .filter_map(|d| d["name"].as_str())
            .filter(|name| self.tape.tools.iter().any(|t| t == name))
            .map(str::to_string)
            .collect();
        names.extend(self.tape.custom_tools.iter().map(|t| t.name.clone()));
        names.retain(|name| !self.rejected.contains(name));
        names
    }

    /// The definition as sent: the tape's or tooldefs.json's, with tool tool_overrides applied (A9.1).
    fn definition(&self, name: &str) -> Option<Value> {
        if self.rejected.contains(name) {
            return None;
        }
        let m = self.mods();
        let mut def = if name == "tool_search" && m.tool_search.is_some() {
            json!({
                "name": "tool_search",
                "description": "Find tools by keyword and load their definitions for the next request.",
                "input_schema": {
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "Words that describe the tool you need"}},
                    "required": ["query"],
                    "additionalProperties": false,
                },
            })
        } else if name == "run_agent" && m.subagents.is_some() {
            json!({
                "name": "run_agent",
                "description": "Hand a self-contained task to a sub-agent and get its final answer back.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "agent": {"type": "string", "description": "Which sub-agent to run"},
                        "brief": {"type": "string", "description": "The task, and what to return"},
                    },
                    "required": ["agent", "brief"],
                    "additionalProperties": false,
                },
            })
        } else if let Some(custom) = self.tape.custom_tools.iter().find(|t| t.name == name) {
            json!({"name": custom.name, "description": custom.description, "input_schema": custom.input_schema})
        } else if self.tape.tools.iter().any(|t| t == name) {
            self.builtin.iter().find(|d| d["name"].as_str() == Some(name))?.clone()
        } else {
            return None;
        };
        if let Some(over) = m.tool_overrides.get(name) {
            if let Some(description) = &over.description {
                def["description"] = json!(description);
            }
            if let Some(schema) = &over.schema {
                def["input_schema"] = schema.clone();
            }
        }
        Some(def)
    }

    /// The tool definitions of a main-agent request (A9.2, A10.3, A15.10): all of them, or with
    /// tool_search the always tools, the loaded ones, then tool_search; run_agent comes last.
    fn request_tools(&self) -> Vec<Value> {
        let m = self.mods();
        let names = self.all_tool_names();
        let mut out: Vec<Value> = match &m.tool_search {
            None => names.iter().filter_map(|n| self.definition(n)).collect(),
            Some(always) => {
                let mut out: Vec<Value> = names
                    .iter()
                    .filter(|n| always.contains(n))
                    .filter_map(|n| self.definition(n))
                    .collect();
                out.extend(
                    names
                        .iter()
                        .filter(|n| !always.contains(n) && self.loaded.contains(*n))
                        .filter_map(|n| self.definition(n)),
                );
                out.extend(self.definition("tool_search"));
                out
            }
        };
        out.extend(self.definition("run_agent"));
        out
    }

    /// A sub-agent's tools: the tape's, without tool_search and run_agent (A14.1).
    fn sub_tools(&self) -> Vec<Value> {
        self.all_tool_names().iter().filter_map(|n| self.definition(n)).collect()
    }

    /// The tool_search tool (A9.2, A10.5): loads up to five unloaded tools whose name and
    /// description contain every word of the query.
    fn tool_search(&mut self, input: &Value) -> workspace::Done {
        let query = input.get("query").and_then(Value::as_str).unwrap_or("").to_string();
        let words: Vec<String> = query.to_lowercase().split_whitespace().map(str::to_string).collect();
        let done = |ok: bool, output: String| workspace::Done {
            ok,
            output,
            latency_ms: 100,
        };
        if words.is_empty() {
            return done(false, format!("No tool matched: {query}"));
        }
        let matches: Vec<String> = self
            .all_tool_names()
            .into_iter()
            .filter(|name| {
                let description = self
                    .definition(name)
                    .and_then(|d| d["description"].as_str().map(str::to_string))
                    .unwrap_or_default();
                let haystack = format!("{name} {description}").to_lowercase();
                words.iter().all(|word| haystack.contains(word.as_str()))
            })
            .collect();
        if matches.is_empty() {
            return done(false, format!("No tool matched: {query}"));
        }
        if matches.iter().all(|name| self.loaded.contains(name)) {
            return done(true, format!("Already loaded: {}", matches.join(", ")));
        }
        let newly: Vec<String> = matches
            .into_iter()
            .filter(|name| !self.loaded.contains(name))
            .take(5)
            .collect();
        self.loaded.extend(newly.iter().cloned());
        done(true, format!("Loaded: {}", newly.join(", ")))
    }

    /// A14.1: the run_agent tool. It pays 100 ms on every call, then runs the sub-agent inline.
    fn run_agent(&mut self, call: &Call) -> Res<workspace::Done> {
        let tape = self.tape;
        let Some(cfg) = self.mods().subagents else {
            return Ok(unknown_tool("run_agent"));
        };
        self.t += 100;
        let name = call.input.get("agent").and_then(Value::as_str).unwrap_or("").to_string();
        let brief = call.input.get("brief").and_then(Value::as_str).unwrap_or("").to_string();
        let refuse = |output: String| workspace::Done {
            ok: false,
            output,
            latency_ms: 0,
        };
        let Some(def) = tape.agents.get(&name) else {
            return Ok(refuse(format!("Unknown agent: {name}")));
        };
        if self.subs_started >= cfg.max {
            return Ok(refuse(format!("Sub-agent limit reached ({})", cfg.max)));
        }
        self.subs_started += 1;
        let k = self.subs_started;
        let context = if cfg.forked { "forked" } else { "isolated" };
        self.emit(
            "subagent_start",
            "loop",
            vec![
                ("name", json!(name)),
                ("k", json!(k)),
                ("context", json!(context)),
                ("brief", json!(brief)),
            ],
        )?;
        let messages = if cfg.forked {
            let mut sent = self.agent.last_sent.clone();
            let last_user = sent.iter().rposition(|m| m["role"] == "user");
            if let Some(index) = last_user {
                sent.truncate(index + 1);
                if let Some(blocks) = sent[index]["content"].as_array_mut() {
                    blocks.push(json!({"type": "text", "text": brief}));
                }
            }
            sent
        } else {
            vec![user_text(&brief)]
        };
        let system = def.system.clone().unwrap_or_else(|| tape.system.clone());
        let script = def.script.clone();
        let sub = Agent::new_sub(k, &name, system, script, messages);
        let before = (self.tokens_in, self.tokens_out, self.cost);
        let parent = std::mem::replace(&mut self.agent, sub);
        let result = self.sub_loop(cfg.max_turns);
        let finished = std::mem::replace(&mut self.agent, parent);
        let status = result?;
        let tokens_used = json!({
            "input": self.tokens_in - before.0,
            "output": self.tokens_out - before.1,
        });
        let cost = self.cost - before.2;
        self.emit(
            "subagent_end",
            "loop",
            vec![
                ("name", json!(name)),
                ("k", json!(k)),
                ("status", json!(status)),
                ("turns", json!(finished.turn)),
                ("tokens", tokens_used),
                ("cost", json!(cost)),
                ("output", json!(finished.last_text)),
            ],
        )?;
        let output = if status == "done" {
            finished.last_text
        } else {
            format!("Sub-agent ended {status}: {}", finished.last_text)
        };
        Ok(workspace::Done {
            ok: status == "done",
            output,
            latency_ms: 0,
        })
    }

    /// A16.1 and A14.4: a ledger tool applies each call once per key (with idempotency), and
    /// lose_reply loses the reply of its k-th application (the effect still happens).
    fn ledger_tool(&mut self, custom: &CustomTool, call: &Call) -> Res<workspace::Done> {
        let m = self.mods();
        if m.idempotency {
            if let Some(output) = self.keys.get(&(custom.name.clone(), call.id.clone())) {
                return Ok(workspace::Done {
                    ok: true,
                    output: output.clone(),
                    latency_ms: custom.latency_ms,
                });
            }
        }
        let count = {
            let entry = self.applied.entry(custom.name.clone()).or_insert(0);
            *entry += 1;
            *entry
        };
        let produced = workspace::run_custom(custom, &call.input);
        if let Some(path) = &custom.ledger {
            let line = format!("{}\n", pyjson(&call.input)?);
            workspace::append(&mut self.files, path, &line).map_err(|e| format!("ledger {path}: {e}"))?;
        }
        if m.idempotency {
            self.keys
                .insert((custom.name.clone(), call.id.clone()), produced.output.clone());
        }
        if custom.lose_reply.contains(&count) {
            return Ok(workspace::Done {
                ok: false,
                output: "Timed out waiting for the reply; the action may have happened.".into(),
                latency_ms: custom.latency_ms,
            });
        }
        Ok(produced)
    }

    /// The messages a request carries: the whole history, or the task alone (A5.1).
    fn sent_messages(&self) -> Vec<Value> {
        if self.mods().history_resend {
            self.agent.messages.clone()
        } else {
            vec![user_text(&self.tape.task)]
        }
    }

    /// A6.3: once per turn, before the control wire. Returns whether a compaction ran.
    fn compact(&mut self) -> Res<bool> {
        let m = self.mods();
        let Some(compaction) = m.compaction.clone() else {
            return Ok(false);
        };
        if !m.history_resend {
            return Ok(false); // A8.1: inert when the history is not resent
        }
        let before = tokens(&self.request_parts().body)?;
        let last_is_user = self.agent.messages.last().map(|m| m["role"] == "user") == Some(true);
        if !(100 * before > compaction.threshold_percent * self.tape.window
            && self.agent.messages.len() >= 5
            && last_is_user)
        {
            return Ok(false);
        }
        let kept: Vec<&crate::tape::Note> = self
            .tape
            .notes
            .iter()
            .filter(|note| note.turn < self.agent.turn && compaction.keep.contains(&note.kind))
            .collect();
        let mut summary = String::from("Summary of the work so far:");
        if kept.is_empty() {
            summary.push_str("\n- (nothing kept)");
        }
        for note in &kept {
            summary.push_str(&format!("\n- {}: {}", note.kind, note.text));
        }
        let kept_ids: Vec<String> = kept.iter().map(|note| note.id.clone()).collect();
        let dropped = self.agent.messages.len() - 2;
        let tail = self.agent.messages[self.agent.messages.len() - 2..].to_vec();
        self.agent.messages = std::iter::once(user_text(&summary)).chain(tail).collect();
        let after = tokens(&self.request_parts().body)?;
        self.emit(
            "compaction",
            "context",
            vec![
                ("tokens_before", json!(before)),
                ("tokens_after", json!(after)),
                ("dropped_messages", json!(dropped)),
                ("kept_notes", json!(kept_ids)),
            ],
        )?;
        Ok(true)
    }

    /// The effort level in force: the board's, else the tape's default, else high (A7.3).
    fn effort_level(&self) -> String {
        if let Some(level) = &self.mods().effort {
            return level.clone();
        }
        self.tape
            .effort
            .as_ref()
            .and_then(|effort| effort.default.clone())
            .unwrap_or_else(|| "high".to_string())
    }

    fn thinking_tokens(&self) -> i64 {
        match &self.tape.effort {
            None => 0,
            Some(effort) => effort.thinking.get(&self.effort_level()).copied().unwrap_or(0),
        }
    }

    fn usage(&self, prompt: i64, output: i64, cache: Option<&CacheInfo>, thinking: i64) -> Value {
        let mut usage = match cache {
            None => json!({"input_tokens": prompt, "output_tokens": output}),
            Some(info) => json!({
                "input_tokens": info.uncached,
                "cache_creation_input_tokens": info.write,
                "cache_read_input_tokens": info.read,
                "output_tokens": output,
            }),
        };
        if self.tape.effort.is_some() {
            usage["output_tokens_details"] = json!({"thinking_tokens": thinking});
        }
        usage
    }

    /// A6.5: the cache's prefixes of the request, matched against the map; the map updated.
    fn cache_step(&mut self, body: &Value, prompt: i64) -> Res<CacheInfo> {
        let (min_tokens, ttl_ms) = self.tape.cache_rules.unwrap_or((0, 0));
        let sent: Vec<Value> = body["messages"].as_array().cloned().unwrap_or_default();
        let n = 2 + sent.len();
        let prefix = |k: usize| -> Value {
            match k {
                1 => json!({"tools": body["tools"]}),
                2 => json!({"system": body["system"], "tools": body["tools"]}),
                _ => json!({
                    "system": body["system"],
                    "tools": body["tools"],
                    "messages": sent[..k - 2],
                }),
            }
        };
        if prompt < min_tokens {
            return Ok(CacheInfo {
                read: 0,
                write: 0,
                uncached: prompt,
                matched: "none".into(),
                hit_percent: 0,
            });
        }
        let t_call = self.t;
        let keys: Vec<String> = (1..=n).map(|k| pyjson(&prefix(k))).collect::<Res<_>>()?;
        let mut i = 0;
        for k in 1..=n {
            if let Some(&written) = self.cache_map.get(&keys[k - 1]) {
                if t_call - written < ttl_ms {
                    i = k;
                }
            }
        }
        let read = if i == 0 { 0 } else { tokens(&prefix(i))? };
        let write = prompt - read;
        if i > 0 {
            self.cache_map.insert(keys[i - 1].clone(), t_call);
        }
        self.cache_map.insert(keys[n - 1].clone(), t_call);
        let matched = match i {
            0 => "none".to_string(),
            1 => "tools".to_string(),
            2 => "system".to_string(),
            _ => format!("messages[{}]", i - 3),
        };
        Ok(CacheInfo {
            read,
            write,
            uncached: prompt - read - write,
            matched,
            hit_percent: 100 * read / prompt,
        })
    }

    fn wire_pair(&mut self, body: &Value, reply: &Reply, usage: &Value, cached: bool) -> Res<()> {
        let m = self.mods();
        let mut messages = body["messages"].clone();
        if cached {
            if let Some(last) = messages.as_array_mut().and_then(|items| items.last_mut()) {
                if let Some(blocks) = last["content"].as_array_mut() {
                    if let Some(block) = blocks.last_mut() {
                        block["cache_control"] = json!({"type": "ephemeral"});
                    }
                }
            }
        }
        let mut request = json!({
            "model": self.model_id,
            "max_tokens": 4096,
            "system": body["system"],
            "tools": body["tools"],
            "messages": messages,
        });
        for (name, value) in &self.params {
            if !self.dropped.contains(name) {
                request[name.as_str()] = value.clone();
            }
        }
        if let Some(level) = &m.effort {
            request["output_config"] = json!({"effort": level});
        }
        let prefix = self.agent.prefix.clone();
        let response = json!({
            "id": format!("msg_{prefix}{}", self.agent.turn),
            "type": "message",
            "role": "assistant",
            "model": self.model_id,
            "content": reply.content,
            "stop_reason": reply.stop,
            "stop_sequence": null,
            "usage": usage,
        });
        self.wire.push(trace_line(&request)?);
        self.wire.push(trace_line(&response)?);
        Ok(())
    }

    fn conditions(&self, body: &Value, request_tokens: i64) -> Ctx {
        let last = self.agent.messages.last();
        let last_user = last.filter(|m| m["role"] == "user");
        let last_result_error = last_user
            .and_then(|m| m["content"].as_array())
            .map(|items| items.iter().any(|item| item["type"] == "tool_result" && item["is_error"] == true))
            .unwrap_or(false);
        let verify_feedback = last_user
            .and_then(|m| m["content"][0]["text"].as_str())
            .map(|text| text.starts_with("Verification failed:"))
            .unwrap_or(false);
        let last_result_texts: Vec<String> = last_user
            .and_then(|m| m["content"].as_array())
            .into_iter()
            .flatten()
            .filter(|item| item["type"] == "tool_result")
            .filter_map(|item| item["content"].as_str().map(str::to_string))
            .collect();
        let sent = self.sent_messages();
        let results_split = sent
            .windows(2)
            .any(|pair| pair[0]["role"] == "user" && pair[1]["role"] == "user");
        let mut strings = Vec::new();
        collect_strings(body, &mut strings);
        let level = self.effort_level();
        Ctx {
            last_result_error,
            last_denied: self.agent.last_permission.as_deref() == Some("deny"),
            verify_feedback,
            last_truncated: self.agent.last_truncated,
            turn: self.agent.turn,
            history_len: sent.len() as i64,
            request_tokens,
            window: self.tape.window,
            strings,
            effort_rank: LEVELS.iter().position(|l| *l == level).unwrap_or(2) as i64,
            results_split,
            tool_names: body["tools"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|tool| tool["name"].as_str().map(str::to_string))
                .collect(),
            last_result_texts,
            session: self.agent.session,
        }
    }

    /// A5.5(a) with A7.2: a tool_use in the loop's history whose result is not in the run of user
    /// messages right after its assistant message.
    fn missing_result_error(&self) -> bool {
        let messages = &self.agent.messages;
        for (index, message) in messages.iter().enumerate() {
            if message["role"] != "assistant" {
                continue;
            }
            let Some(blocks) = message["content"].as_array() else {
                continue;
            };
            let mut answered: Vec<String> = Vec::new();
            for next in &messages[index + 1..] {
                if next["role"] != "user" {
                    break;
                }
                if let Some(items) = next["content"].as_array() {
                    for item in items {
                        if item["type"] == "tool_result" {
                            answered.push(item["tool_use_id"].as_str().unwrap_or("").to_string());
                        }
                    }
                }
            }
            let unanswered = blocks.iter().any(|block| {
                block["type"] == "tool_use" && !answered.iter().any(|id| Some(id.as_str()) == block["id"].as_str())
            });
            if unanswered {
                return true;
            }
        }
        false
    }

    fn policy(&self, call: &Call) -> (String, String, String) {
        let Some(permissions) = self.mods().permissions else {
            return ("allow".into(), "none".into(), "no permission policy".into());
        };
        for order in ["deny", "ask", "allow"] {
            for (index, rule) in permissions.rules.iter().enumerate() {
                if rule.decision != order {
                    continue;
                }
                if rule.tool != "*" && rule.tool != call.name {
                    continue;
                }
                let all = rule
                    .matches
                    .iter()
                    .all(|(field, glob)| workspace::field_matches(&call.input, field, glob));
                if all {
                    return (rule.decision.clone(), format!("rules[{index}]"), rule.reason.clone());
                }
            }
        }
        (
            permissions.mode.clone(),
            "default".into(),
            format!("no rule matched (mode {})", permissions.mode),
        )
    }

    /// A2: after `fatigue.after` asks, a rubber-stamp with `approve_percent` (one draw); otherwise
    /// a careful answer: deny when every deny_if field matches the call, else the default.
    fn simulated_human(&mut self, call: &Call) -> String {
        self.asks += 1;
        let human = &self.tape.human;
        if let Some((after, approve_percent)) = human.fatigue {
            if self.asks > after && self.rng.percent() < approve_percent {
                return "approve".into();
            }
        }
        let careful_deny = !human.deny_if.is_empty()
            && human
                .deny_if
                .iter()
                .all(|(field, glob)| workspace::field_matches(&call.input, field, glob));
        if careful_deny {
            "deny".into()
        } else {
            human.default.clone()
        }
    }

    fn sandbox_check(&self, call: &Call, egress: &[String]) -> (bool, String) {
        if let Some(path) = call.input.get("path").and_then(Value::as_str) {
            if let Some(reason) = workspace::sandbox_reason(&self.files, path) {
                return (false, reason);
            }
        }
        let is_network = !self.rejected.contains(&call.name)
            && self
                .tape
                .custom_tools
                .iter()
                .any(|tool| tool.name == call.name && tool.effect.as_deref() == Some("network"));
        if is_network {
            if let Some(url) = call.input.get("url").and_then(Value::as_str) {
                let host = workspace::host_of(url);
                if !egress.iter().any(|allowed| allowed == &host) {
                    return (false, format!("host not in egress: {host}"));
                }
            }
        }
        (true, String::new())
    }

    /// A7.1: the schema subset, first failure wins. None when valid or when the tool has no
    /// definition (an unknown tool is not checked).
    fn input_problem(&self, call: &Call) -> Option<String> {
        let schema = self.schema_of(&call.name)?;
        let Some(input) = call.input.as_object() else {
            return Some("input must be an object".into());
        };
        let properties = schema.get("properties").and_then(Value::as_object);
        for name in schema["required"].as_array().into_iter().flatten().filter_map(Value::as_str) {
            if !input.contains_key(name) {
                return Some(format!("missing required field: {name}"));
            }
        }
        let closed = schema.get("additionalProperties") == Some(&json!(false));
        for (name, value) in input {
            let property = properties.and_then(|p| p.get(name));
            if property.is_none() && closed {
                return Some(format!("unknown field: {name}"));
            }
            let Some(property) = property else {
                continue;
            };
            if let Some(kind) = property["type"].as_str() {
                if !type_matches(kind, value) {
                    return Some(format!("field {name} must be {kind}"));
                }
            }
            if let Some(choices) = property["enum"].as_array() {
                if !choices.iter().any(|choice| pyjson(choice).ok() == pyjson(value).ok()) {
                    let listed: Vec<String> = choices.iter().map(|c| pyjson(c).unwrap_or_default()).collect();
                    return Some(format!("field {name} must be one of: {}", listed.join(", ")));
                }
            }
        }
        None
    }

    fn schema_of(&self, name: &str) -> Option<Value> {
        self.definition(name).map(|def| def["input_schema"].clone())
    }

    fn run_tool(&mut self, call: &Call) -> Res<workspace::Done> {
        let tape = self.tape;
        if self.rejected.contains(&call.name) {
            return Ok(unknown_tool(&call.name));
        }
        if call.name == "tool_search" && self.mods().tool_search.is_some() {
            return Ok(self.tool_search(&call.input));
        }
        if call.name == "run_agent" && self.mods().subagents.is_some() {
            return self.run_agent(call);
        }
        if let Some(custom) = tape.custom_tools.iter().find(|t| t.name == call.name) {
            if custom.ledger.is_some() {
                return self.ledger_tool(custom, call);
            }
            return Ok(workspace::run_custom(custom, &call.input));
        }
        if tape.tools.contains(&call.name) {
            if let Some(done) = workspace::run_builtin(&call.name, &call.input, &mut self.files, tape) {
                return Ok(done);
            }
        }
        Ok(unknown_tool(&call.name))
    }

    /// A11.3: a network tool whose input carries a canary leaks it (once per call, after its last
    /// attempt).
    fn emit_leak(&mut self, call: &Call) -> Res<()> {
        if self.rejected.contains(&call.name) || self.tape.canaries.is_empty() {
            return Ok(());
        }
        let network = self
            .tape
            .custom_tools
            .iter()
            .any(|tool| tool.name == call.name && tool.effect.as_deref() == Some("network"));
        if !network {
            return Ok(());
        }
        let mut strings = Vec::new();
        collect_strings(&call.input, &mut strings);
        let found: Vec<String> = self
            .tape
            .canaries
            .iter()
            .filter(|canary| strings.iter().any(|s| s.contains(canary.as_str())))
            .cloned()
            .collect();
        if found.is_empty() {
            return Ok(());
        }
        self.emit(
            "leak",
            "permissions",
            vec![
                ("tool", json!(call.name)),
                ("canaries", json!(found)),
                ("tool_use_id", json!(call.id)),
            ],
        )
    }

    fn cap(&self, output: &str) -> Res<(String, bool)> {
        let Some(max) = self.mods().output_cap else {
            return Ok((output.to_string(), false));
        };
        if tokens(&json!(output))? <= max {
            return Ok((output.to_string(), false));
        }
        let chars: Vec<char> = output.chars().collect();
        let keep = (2 * max).max(0) as usize;
        let removed = chars.len().saturating_sub(2 * keep);
        if removed == 0 {
            return Ok((output.to_string(), false));
        }
        let head: String = chars[..keep].iter().collect();
        let tail: String = chars[chars.len() - keep..].iter().collect();
        Ok((
            format!("{head}\n[... {removed} characters cut; ask for a smaller range ...]\n{tail}"),
            true,
        ))
    }

    fn backoff(&mut self, retry: &Retry, attempt: i64, retry_after: i64) -> i64 {
        let shift = (attempt - 1).clamp(0, 30) as u32;
        let base = retry.cap_ms.min(retry.base_ms.saturating_mul(1i64 << shift));
        let wait = if retry.jitter_full {
            self.rng.below(base + 1)
        } else {
            base
        };
        wait.max(retry_after)
    }

    fn call_model(&mut self, ctx: &Ctx) -> Res<Result<Reply, Failure>> {
        if let Some(outage) = &self.tape.outage {
            if outage.from_ms <= self.t && self.t < outage.to_ms {
                return Ok(Err(failure(&outage.kind, 300, outage.retry_after_ms)));
            }
        }
        for (percent, kind) in self.tape.faults.clone() {
            if self.rng.percent() < percent {
                return Ok(Err(failure(&kind, 300, 0)));
            }
        }
        let prefix = self.agent.prefix.clone();
        match self.agent.cursor.next(ctx, &mut self.rng) {
            Produced::Reply(spec) => {
                let mut content = Vec::new();
                if let Some(say) = &spec.say {
                    content.push(json!({"type": "text", "text": say}));
                }
                let mut calls = Vec::new();
                for (k, (name, input)) in spec.tools.iter().enumerate() {
                    let id = format!("toolu_{prefix}{}_{}", self.agent.turn, k + 1);
                    content.push(json!({"type": "tool_use", "id": id, "name": name, "input": input}));
                    calls.push(Call {
                        id,
                        name: name.clone(),
                        input: input.clone(),
                    });
                }
                let stop = spec.stop.clone().unwrap_or_else(|| {
                    if calls.is_empty() {
                        "end_turn".into()
                    } else {
                        "tool_use".into()
                    }
                });
                Ok(Ok(Reply {
                    content,
                    say: spec.say.unwrap_or_default(),
                    calls,
                    stop,
                    latency_ms: spec.latency_ms,
                }))
            }
            Produced::Error {
                kind,
                retry_after_ms,
                error_ms,
            } => Ok(Err(failure(&kind, error_ms, retry_after_ms))),
            Produced::Exhausted => Ok(Ok(Reply {
                content: vec![json!({"type": "text", "text": "(the script has run out)"})],
                say: "(the script has run out)".into(),
                calls: Vec::new(),
                stop: "end_turn".into(),
                latency_ms: None,
            })),
        }
    }

}

fn unknown_tool(name: &str) -> workspace::Done {
    workspace::Done {
        ok: false,
        output: format!("Unknown tool: {name}"),
        latency_ms: 100,
    }
}

fn type_matches(kind: &str, value: &Value) -> bool {
    match kind {
        "string" => value.is_string(),
        "integer" => value.as_i64().is_some(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        "array" => value.is_array(),
        "object" => value.is_object(),
        _ => true,
    }
}

/// The largest part of the request by tokens (A9.4): system, tools, then messages[k]; ties go to
/// the earliest part.
fn top_part(body: &Value) -> Res<(String, i64)> {
    let mut best = ("system".to_string(), tokens(&body["system"])?);
    let tools = tokens(&body["tools"])?;
    if tools > best.1 {
        best = ("tools".to_string(), tools);
    }
    for (index, message) in body["messages"].as_array().into_iter().flatten().enumerate() {
        let count = tokens(message)?;
        if count > best.1 {
            best = (format!("messages[{index}]"), count);
        }
    }
    Ok(best)
}

/// Every string value below `value` (values, not keys), in order.
fn collect_strings(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(text) => out.push(text.clone()),
        Value::Array(items) => items.iter().for_each(|item| collect_strings(item, out)),
        Value::Object(map) => map.values().for_each(|item| collect_strings(item, out)),
        _ => {}
    }
}

/// Replaces each pattern (literal) in every string below `value`, counting replacements.
fn redact(value: &mut Value, patterns: &[String]) -> i64 {
    match value {
        Value::String(text) => {
            let mut count = 0;
            for pattern in patterns {
                if pattern.is_empty() {
                    continue;
                }
                count += text.matches(pattern.as_str()).count() as i64;
                *text = text.replace(pattern.as_str(), "[REDACTED]");
            }
            count
        }
        Value::Array(items) => items.iter_mut().map(|item| redact(item, patterns)).sum(),
        Value::Object(map) => map.values_mut().map(|item| redact(item, patterns)).sum(),
        _ => 0,
    }
}
