//! The virtual workspace and its built-in tools (ENGINE.md section 6.4), the checks (section 5),
//! custom tools (section 5), globs (section 7.5) and the sandbox's paths and hosts (section 7.7).

use crate::canon::pyjson;
use crate::tape::{CustomTool, Tape};
use serde_json::Value;
use std::collections::BTreeMap;

/// A workspace entry: a file, or a link whose target is relative to the link's directory (A3.7).
#[derive(Clone)]
pub enum Node {
    Text(String),
    Link(String),
}

/// The workspace (`files`, keyed by normal form) and the files a path escape can reach (`outside`).
#[derive(Clone, Default)]
pub struct Files {
    pub inside: BTreeMap<String, Node>,
    pub outside: BTreeMap<String, String>,
}

/// Where a path lands once links are followed.
pub enum Place {
    Inside(String),
    Outside(String),
}

const MAX_HOPS: usize = 8;

pub struct Done {
    pub ok: bool,
    pub output: String,
    pub latency_ms: i64,
}

fn text_of(input: &Value, key: &str) -> String {
    input.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

pub fn run_builtin(name: &str, input: &Value, files: &mut Files, tape: &Tape) -> Option<Done> {
    let done = |ok: bool, output: String, ms: i64| Done {
        ok,
        output,
        latency_ms: ms,
    };
    Some(match name {
        "read_file" => {
            let path = text_of(input, "path");
            match read(files, &path) {
                Ok(content) => done(true, content, 100),
                Err(message) => done(false, message, 100),
            }
        }
        "write_file" => {
            let path = text_of(input, "path");
            let content = text_of(input, "content");
            match write(files, &path, content.clone()) {
                Ok(()) => done(true, format!("Wrote {path} ({} chars)", content.chars().count()), 100),
                Err(message) => done(false, message, 100),
            }
        }
        "edit_file" => {
            let path = text_of(input, "path");
            let old = text_of(input, "old_text");
            let new = text_of(input, "new_text");
            match read(files, &path) {
                Err(message) => done(false, message, 100),
                Ok(content) => {
                    let count = if old.is_empty() {
                        0
                    } else {
                        content.matches(old.as_str()).count()
                    };
                    match count {
                        0 => done(
                            false,
                            format!("old_text was not found in {path}. Read the file again."),
                            100,
                        ),
                        1 => {
                            let edited = content.replacen(old.as_str(), &new, 1);
                            match write(files, &path, edited) {
                                Ok(()) => done(true, format!("Edited {path} (1 change)"), 100),
                                Err(message) => done(false, message, 100),
                            }
                        }
                        n => done(
                            false,
                            format!("old_text appears {n} times in {path}; include more context."),
                            100,
                        ),
                    }
                }
            }
        }
        "list_files" => done(true, list(files), 100),
        "run_command" => {
            let cmd = text_of(input, "cmd");
            let words: Vec<&str> = cmd.split_whitespace().collect();
            match words.first().copied() {
                Some("pytest") if words.len() == 1 || words == ["pytest", "-q"] => {
                    if tests_pass(tape, files, false) {
                        done(true, tape.test_pass.clone(), 2000)
                    } else {
                        done(false, tape.test_fail.clone(), 2000)
                    }
                }
                Some("ls") => done(true, list(files), 2000),
                Some("cat") if words.len() == 2 => match read(files, words[1]) {
                    Ok(content) => done(true, content, 2000),
                    Err(message) => done(false, message, 2000),
                },
                Some("cat") => done(false, "usage: cat <path>".to_string(), 2000),
                Some(first) => done(false, format!("command not found: {first}"), 2000),
                None => done(false, "command not found: ".to_string(), 2000),
            }
        }
        _ => return None,
    })
}

fn list(files: &Files) -> String {
    files.inside.keys().cloned().collect::<Vec<_>>().join("\n")
}

fn missing(path: &str) -> String {
    format!("No file at '{path}'. Call list_files to see what exists.")
}

/// Follows links (at most MAX_HOPS) from the path's normal form to where it lands.
pub fn resolve(files: &Files, path: &str) -> Result<Place, String> {
    let mut current = normal(path);
    let mut hops = 0;
    loop {
        if is_outside(&current) {
            return Ok(Place::Outside(current));
        }
        match files.inside.get(&current) {
            Some(Node::Link(target)) => {
                hops += 1;
                if hops > MAX_HOPS {
                    return Err(format!("Too many levels of links: {path}"));
                }
                let dir = current.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
                current = if target.starts_with('/') {
                    normal(target)
                } else {
                    normal(&format!("{dir}/{target}"))
                };
            }
            _ => return Ok(Place::Inside(current)),
        }
    }
}

fn read(files: &Files, path: &str) -> Result<String, String> {
    match resolve(files, path)? {
        Place::Inside(key) => match files.inside.get(&key) {
            Some(Node::Text(content)) => Ok(content.clone()),
            _ => Err(missing(path)),
        },
        Place::Outside(key) => files.outside.get(&key).cloned().ok_or_else(|| missing(path)),
    }
}

fn write(files: &mut Files, path: &str, content: String) -> Result<(), String> {
    let key = normal(path);
    if key.is_empty() || key == "/" {
        return Err(format!("Is a directory: {path}"));
    }
    match resolve(files, path)? {
        Place::Inside(key) => {
            files.inside.insert(key, Node::Text(content));
        }
        Place::Outside(key) => {
            files.outside.insert(key, content);
        }
    }
    Ok(())
}

pub fn run_custom(tool: &CustomTool, input: &Value) -> Done {
    let mut found = None;
    for result in &tool.results {
        let all = result.matches.iter().all(|(field, wanted)| {
            input
                .get(field)
                .map(|actual| pyjson(actual).ok() == pyjson(wanted).ok())
                .unwrap_or(false)
        });
        if all {
            found = Some((result.output.clone(), result.ok));
            break;
        }
    }
    let (output, ok) = found.unwrap_or((tool.default_output.clone(), tool.default_ok));
    Done {
        ok,
        output,
        latency_ms: tool.latency_ms,
    }
}

/// The number of lines in a file (A17.4): newlines, plus one when text follows the last newline.
pub fn line_count(content: &str) -> i64 {
    let newlines = content.matches('\n').count() as i64;
    newlines + i64::from(!content.is_empty() && !content.ends_with('\n'))
}

/// A file's text, when the file is there (the progress file, A14.2).
pub fn read_text(files: &Files, path: &str) -> Option<String> {
    read(files, path).ok()
}

/// Appends text to a workspace file, creating the file on first use (A14.4 ledgers).
pub fn append(files: &mut Files, path: &str, text: &str) -> Result<(), String> {
    let mut content = read(files, path).unwrap_or_default();
    content.push_str(text);
    write(files, path, content)
}

/// One file's check (section 5, A3.5, A17.4): a missing file fails every kind of check.
fn file_passes(
    files: &Files,
    file: &str,
    contains: Option<&str>,
    not_contains: Option<&str>,
    lines: Option<i64>,
) -> bool {
    let Ok(content) = read(files, file) else {
        return false;
    };
    contains.is_none_or(|needle| content.contains(needle))
        && not_contains.is_none_or(|needle| !content.contains(needle))
        && lines.is_none_or(|wanted| line_count(&content) == wanted)
}

pub fn checks_hold(tape: &Tape, files: &Files) -> bool {
    tape.checks.iter().all(|check| {
        file_passes(
            files,
            &check.file,
            check.contains.as_deref(),
            check.not_contains.as_deref(),
            check.lines,
        )
    })
}

/// The suite (A9.3): every active test's check holds. Markers come from the tape's original
/// workspace when `pristine` (the gate), else from the live files.
pub fn suite_passes(tape: &Tape, live: &Files, pristine: bool) -> bool {
    let markers = if pristine { &tape.files } else { live };
    tape.tests.iter().all(|test| {
        let active = read(markers, &test.marker_file)
            .map(|content| content.contains(test.marker_text.as_str()))
            .unwrap_or(false);
        !active
            || file_passes(
                live,
                &test.check_file,
                test.check_contains.as_deref(),
                test.check_not_contains.as_deref(),
                None,
            )
    })
}

/// What `pytest` and the verify gate report: the suite when the tape has one, else the checks.
pub fn tests_pass(tape: &Tape, live: &Files, pristine: bool) -> bool {
    if tape.tests.is_empty() {
        checks_hold(tape, live)
    } else {
        suite_passes(tape, live, pristine)
    }
}

/// Glob matching (section 7.5 and A3.10): `**` any characters, `*` any but `/`, `?` one character.
pub fn glob_matches(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let t: Vec<char> = text.chars().collect();
    let mut reach = vec![vec![false; t.len() + 1]; p.len() + 1];
    reach[0][0] = true;
    for i in 0..=p.len() {
        for j in 0..=t.len() {
            if !reach[i][j] {
                continue;
            }
            if i < p.len() && p[i] == '*' && i + 1 < p.len() && p[i + 1] == '*' {
                for cell in reach[i + 2][j..].iter_mut() {
                    *cell = true;
                }
            } else if i < p.len() && p[i] == '*' {
                reach[i + 1][j] = true;
                let mut k = j;
                while k < t.len() && t[k] != '/' {
                    k += 1;
                    reach[i + 1][k] = true;
                }
            } else if i < p.len() && j < t.len() && (p[i] == '?' || p[i] == t[j]) {
                reach[i + 1][j + 1] = true;
            }
        }
    }
    reach[p.len()][t.len()]
}

/// True when the input's field matches the glob (A3.10): a string as it is, any other value by its
/// pyjson form; an absent field never matches.
pub fn field_matches(input: &Value, field: &str, glob: &str) -> bool {
    match input.get(field) {
        None => false,
        Some(value) => {
            let text = match value.as_str() {
                Some(s) => s.to_string(),
                None => pyjson(value).unwrap_or_default(),
            };
            glob_matches(glob, &text)
        }
    }
}

/// The normal form of a path (A3.6): `.` and empty parts dropped, `..` resolved; a leading `/`
/// stays (an absolute path is never inside the workspace), a `..` that climbs out stays too.
pub fn normal(path: &str) -> String {
    let absolute = path.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => match parts.last() {
                Some(last) if *last != ".." => {
                    parts.pop();
                }
                _ if absolute => {}
                _ => parts.push(".."),
            },
            other => parts.push(other),
        }
    }
    let joined = parts.join("/");
    if absolute {
        format!("/{joined}")
    } else {
        joined
    }
}

fn is_outside(normal_form: &str) -> bool {
    normal_form.starts_with('/') || normal_form == ".." || normal_form.starts_with("../")
}

/// The sandbox's reason for a path (A3.8, A13.1): None when it stays inside the workspace.
pub fn sandbox_reason(files: &Files, path: &str) -> Option<String> {
    let mut current = normal(path);
    let mut hops = 0;
    loop {
        if is_outside(&current) {
            return Some(if current == normal(path) {
                format!("path outside the workspace: {path}")
            } else {
                format!("path outside the workspace: {path} -> {current}")
            });
        }
        match files.inside.get(&current) {
            Some(Node::Link(target)) => {
                hops += 1;
                if hops > MAX_HOPS {
                    return Some(format!("too many levels of links: {path}"));
                }
                let dir = current.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
                current = if target.starts_with('/') {
                    normal(target)
                } else {
                    normal(&format!("{dir}/{target}"))
                };
            }
            _ => return None,
        }
    }
}

/// The host of a URL (A3.8): the text after `://` up to `/`, `?` or `#`, minus user information
/// and port, lowercased.
pub fn host_of(url: &str) -> String {
    let Some(start) = url.find("://") else {
        return String::new();
    };
    let rest = &url[start + 3..];
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let mut host = &rest[..end];
    if let Some(at) = host.rfind('@') {
        host = &host[at + 1..];
    }
    if let Some(colon) = host.rfind(':') {
        if !host[colon + 1..].is_empty() && host[colon + 1..].chars().all(|c| c.is_ascii_digit()) {
            host = &host[..colon];
        }
    }
    host.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::{glob_matches, host_of, normal};

    #[test]
    fn globs_follow_section_7_5() {
        assert!(glob_matches("rm -rf *", "rm -rf build"));
        assert!(!glob_matches("rm *", "rm a/b"), "* does not cross a slash");
        assert!(glob_matches("rm **", "rm a/b"), "** crosses slashes");
        assert!(glob_matches("a?c", "abc") && !glob_matches("a?c", "abbc"));
    }

    #[test]
    fn paths_normalize_lexically_and_keep_escapes() {
        assert_eq!(normal("a/./b/../c"), "a/c");
        assert_eq!(normal("../secrets.env"), "../secrets.env");
        assert_eq!(normal("/etc/passwd"), "/etc/passwd");
    }

    #[test]
    fn hosts_drop_credentials_port_and_path() {
        assert_eq!(host_of("https://User@Example.com:8443/x?y=1"), "example.com");
        assert_eq!(host_of("no-scheme"), "");
    }
}
