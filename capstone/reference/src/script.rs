//! The scripted model (ENGINE.md section 6): steps, branches, conditions and the cursor.

use crate::prng::Rng;
use crate::tape::{field, int, object, text, Res};
use serde_json::Value;
use std::collections::VecDeque;

#[derive(Clone)]
pub enum Step {
    Reply {
        say: Option<String>,
        tools: Vec<(String, Value)>,
        stop: Option<String>,
        latency_ms: Option<i64>,
    },
    Error {
        kind: String,
        retry_after_ms: i64,
        error_ms: i64,
    },
    Branch(Vec<(i64, Vec<Step>)>),
    When(Vec<(Option<Cond>, Vec<Step>)>),
    Repeat {
        steps: Vec<Step>,
        times: Option<i64>,
    },
}

#[derive(Clone)]
pub enum Cond {
    LastResultError,
    LastDenied,
    VerifyFeedback,
    LastTruncated,
    TurnGte(i64),
    HistoryLt(i64),
    ContextGte(i64),
    SentLacks(String),
    EffortGte(i64),
    ResultsSplit,
    ToolsGte(i64),
    ToolLoaded(String),
    LastResultContains(String),
    SessionGte(i64),
}

pub fn parse_steps(value: &Value) -> Res<Vec<Step>> {
    let items = value.as_array().ok_or("script must be a list")?;
    items.iter().map(parse_step).collect()
}

fn parse_step(value: &Value) -> Res<Step> {
    let map = object(value, "a script step")?;
    if let Some(kind) = map.get("error") {
        return Ok(Step::Error {
            kind: text(kind, "error")?,
            retry_after_ms: match map.get("retry_after_ms") {
                Some(v) => int(v, "retry_after_ms")?,
                None => 0,
            },
            error_ms: match map.get("error_ms") {
                Some(v) => int(v, "error_ms")?,
                None => 300,
            },
        });
    }
    if let Some(options) = map.get("branch") {
        let options = options.as_array().ok_or("branch must be a list")?;
        let mut parsed = Vec::new();
        for option in options {
            let option = object(option, "a branch option")?;
            let percent = int(field(option, "percent", "a branch option")?, "percent")?;
            parsed.push((percent, parse_steps(field(option, "then", "a branch option")?)?));
        }
        return Ok(Step::Branch(parsed));
    }
    if let Some(arms) = map.get("when") {
        let arms = arms.as_array().ok_or("when must be a list")?;
        let mut parsed = Vec::new();
        for arm in arms {
            let arm = object(arm, "a when arm")?;
            let cond = match arm.get("if") {
                Some(text_value) => Some(parse_cond(&text(text_value, "if")?)?),
                None => None,
            };
            parsed.push((cond, parse_steps(field(arm, "then", "a when arm").or_else(|_| field(arm, "else", "a when arm"))?)?));
        }
        return Ok(Step::When(parsed));
    }
    if let Some(repeat) = map.get("repeat") {
        let repeat = object(repeat, "repeat")?;
        let times = match field(repeat, "times", "repeat")? {
            Value::String(word) if word == "forever" => None,
            other => Some(int(other, "times")?),
        };
        return Ok(Step::Repeat {
            steps: parse_steps(field(repeat, "steps", "repeat")?)?,
            times,
        });
    }
    let tools = match map.get("tools") {
        None => Vec::new(),
        Some(Value::Array(calls)) => calls
            .iter()
            .map(|call| {
                let pair = call.as_array().filter(|p| p.len() == 2).ok_or("a tool call is [name, input]")?;
                Ok((text(&pair[0], "tool name")?, pair[1].clone()))
            })
            .collect::<Res<Vec<_>>>()?,
        Some(_) => return Err("tools must be a list".into()),
    };
    Ok(Step::Reply {
        say: map.get("say").map(|v| text(v, "say")).transpose()?,
        tools,
        stop: map.get("stop").map(|v| text(v, "stop")).transpose()?,
        latency_ms: map.get("latency_ms").map(|v| int(v, "latency_ms")).transpose()?,
    })
}

fn parse_cond(name: &str) -> Res<Cond> {
    let number = |rest: &str| -> Res<i64> {
        let canonical = rest == "0" || (!rest.is_empty() && !rest.starts_with('0') && rest.bytes().all(|b| b.is_ascii_digit()));
        if !canonical {
            return Err(format!("bad condition {name}: a canonical integer is needed"));
        }
        rest.parse().map_err(|_| format!("bad condition {name}"))
    };
    match name {
        "last_result_error" => Ok(Cond::LastResultError),
        "last_denied" => Ok(Cond::LastDenied),
        "verify_feedback" => Ok(Cond::VerifyFeedback),
        "last_truncated" => Ok(Cond::LastTruncated),
        "results_split" => Ok(Cond::ResultsSplit),
        _ => {
            if let Some(n) = name.strip_prefix("turn_gte:") {
                Ok(Cond::TurnGte(number(n)?))
            } else if let Some(n) = name.strip_prefix("history_lt:") {
                Ok(Cond::HistoryLt(number(n)?))
            } else if let Some(n) = name.strip_prefix("context_gte:") {
                Ok(Cond::ContextGte(number(n)?))
            } else if let Some(text) = name.strip_prefix("last_result_contains:") {
                if text.is_empty() {
                    return Err("last_result_contains: needs text".into());
                }
                Ok(Cond::LastResultContains(text.to_string()))
            } else if let Some(text) = name.strip_prefix("sent_lacks:") {
                if text.is_empty() {
                    return Err("sent_lacks: needs text".into());
                }
                Ok(Cond::SentLacks(text.to_string()))
            } else if let Some(n) = name.strip_prefix("session_gte:") {
                Ok(Cond::SessionGte(number(n)?))
            } else if let Some(n) = name.strip_prefix("tools_gte:") {
                Ok(Cond::ToolsGte(number(n)?))
            } else if let Some(tool) = name.strip_prefix("tool_loaded:") {
                Ok(Cond::ToolLoaded(tool.to_string()))
            } else if let Some(level) = name.strip_prefix("effort_gte:") {
                let rank = crate::tape::LEVELS
                    .iter()
                    .position(|l| *l == level)
                    .ok_or_else(|| format!("unknown effort level {level}"))?;
                Ok(Cond::EffortGte(rank as i64))
            } else {
                Err(format!("unknown condition {name}"))
            }
        }
    }
}

/// What the harness knows when a call is about to be made (the conditions read it).
pub struct Ctx {
    pub last_result_error: bool,
    pub last_denied: bool,
    pub verify_feedback: bool,
    pub last_truncated: bool,
    pub turn: i64,
    pub history_len: i64,
    pub request_tokens: i64,
    pub window: i64,
    pub strings: Vec<String>,
    pub effort_rank: i64,
    pub results_split: bool,
    pub tool_names: Vec<String>,
    pub last_result_texts: Vec<String>,
    pub session: i64,
}

pub struct ReplySpec {
    pub say: Option<String>,
    pub tools: Vec<(String, Value)>,
    pub stop: Option<String>,
    pub latency_ms: Option<i64>,
}

pub enum Produced {
    Reply(ReplySpec),
    Error {
        kind: String,
        retry_after_ms: i64,
        error_ms: i64,
    },
    Exhausted,
}

pub struct Cursor {
    queue: VecDeque<Step>,
}

impl Cursor {
    pub fn new(steps: Vec<Step>) -> Cursor {
        Cursor {
            queue: steps.into(),
        }
    }

    fn splice(&mut self, steps: Vec<Step>) {
        for step in steps.into_iter().rev() {
            self.queue.push_front(step);
        }
    }

    /// Consumes steps until one reply or one error (branches, conditions and repeats splice in).
    pub fn next(&mut self, ctx: &Ctx, rng: &mut Rng) -> Produced {
        loop {
            let Some(step) = self.queue.pop_front() else {
                return Produced::Exhausted;
            };
            match step {
                Step::Reply {
                    say,
                    tools,
                    stop,
                    latency_ms,
                } => {
                    return Produced::Reply(ReplySpec {
                        say,
                        tools,
                        stop,
                        latency_ms,
                    })
                }
                Step::Error {
                    kind,
                    retry_after_ms,
                    error_ms,
                } => {
                    return Produced::Error {
                        kind,
                        retry_after_ms,
                        error_ms,
                    }
                }
                Step::Branch(options) => {
                    let draw = rng.percent();
                    let mut cumulative = 0;
                    for (percent, then) in options {
                        cumulative += percent;
                        if draw < cumulative {
                            self.splice(then);
                            break;
                        }
                    }
                }
                Step::When(arms) => {
                    for (cond, then) in arms {
                        let holds = match &cond {
                            None => true,
                            Some(c) => holds(c, ctx),
                        };
                        if holds {
                            self.splice(then);
                            break;
                        }
                    }
                }
                Step::Repeat { steps, times } => match times {
                    Some(count) => {
                        let mut all = Vec::new();
                        for _ in 0..count.max(0) {
                            all.extend(steps.iter().cloned());
                        }
                        self.splice(all);
                    }
                    None => {
                        let mut again = steps.clone();
                        again.push(Step::Repeat { steps, times: None });
                        self.splice(again);
                    }
                },
            }
        }
    }
}

fn holds(cond: &Cond, ctx: &Ctx) -> bool {
    match cond {
        Cond::LastResultError => ctx.last_result_error,
        Cond::LastDenied => ctx.last_denied,
        Cond::VerifyFeedback => ctx.verify_feedback,
        Cond::LastTruncated => ctx.last_truncated,
        Cond::TurnGte(n) => ctx.turn >= *n,
        Cond::HistoryLt(n) => ctx.history_len < *n,
        Cond::ContextGte(n) => 100 * ctx.request_tokens >= n * ctx.window,
        Cond::SentLacks(text) => !ctx.strings.iter().any(|s| s.contains(text.as_str())),
        Cond::EffortGte(rank) => ctx.effort_rank >= *rank,
        Cond::ResultsSplit => ctx.results_split,
        Cond::ToolsGte(n) => ctx.tool_names.len() as i64 >= *n,
        Cond::ToolLoaded(name) => ctx.tool_names.contains(name),
        Cond::SessionGte(n) => ctx.session >= *n,
        Cond::LastResultContains(text) => ctx.last_result_texts.iter().any(|t| t.contains(text.as_str())),
    }
}
