//! Canonical JSON (ENGINE.md sections 1, 2 and 10): the two forms every runtime prints exactly.
//!
//! `trace_line` is a trace file's line: keys sorted, separators `,` and `:`, no spaces.
//! `pyjson` is Python's `json.dumps` with its defaults: keys in insertion order, separators `, `
//! and `: `. Both escape everything outside printable ASCII as `\uXXXX` (lowercase hex, UTF-16
//! units), as Python does. Numbers must be integers: a float is an error (ENGINE.md section 1).

use serde_json::Value;

#[derive(Clone, Copy)]
struct Style {
    sorted: bool,
    spaced: bool,
}

const TRACE: Style = Style {
    sorted: true,
    spaced: false,
};
const PYJSON: Style = Style {
    sorted: false,
    spaced: true,
};

/// One trace line (no newline): sorted keys, compact separators.
pub fn trace_line(value: &Value) -> Result<String, String> {
    render(value, TRACE)
}

/// Python's `json.dumps(value)` with its defaults: insertion order, `", "` and `": "`.
#[allow(dead_code)] // used from the first step on, when tokens are counted
pub fn pyjson(value: &Value) -> Result<String, String> {
    render(value, PYJSON)
}

fn render(value: &Value, style: Style) -> Result<String, String> {
    let mut out = String::new();
    write_value(value, style, &mut out)?;
    Ok(out)
}

fn write_value(value: &Value, style: Style, out: &mut String) -> Result<(), String> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(flag) => out.push_str(if *flag { "true" } else { "false" }),
        Value::Number(number) => match number.as_i64() {
            Some(int) => out.push_str(&int.to_string()),
            None => {
                return Err(format!(
                    "{number} is not an integer; ENGINE.md section 1 allows integers only"
                ))
            }
        },
        Value::String(text) => write_string(text, out),
        Value::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push_str(separator(style));
                }
                write_value(item, style, out)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            if style.sorted {
                entries.sort_by(|a, b| a.0.cmp(b.0));
            }
            out.push('{');
            for (index, (key, item)) in entries.into_iter().enumerate() {
                if index > 0 {
                    out.push_str(separator(style));
                }
                write_string(key, out);
                out.push_str(if style.spaced { ": " } else { ":" });
                write_value(item, style, out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

fn separator(style: Style) -> &'static str {
    if style.spaced {
        ", "
    } else {
        ","
    }
}

fn write_string(text: &str, out: &mut String) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            ' '..='~' => out.push(ch),
            _ => {
                let mut units = [0u16; 2];
                for unit in ch.encode_utf16(&mut units) {
                    out.push_str(&format!("\\u{unit:04x}"));
                }
            }
        }
    }
    out.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn trace_lines_sort_keys_and_stay_compact() {
        let value = json!({"b": 1, "a": [true, null]});
        assert_eq!(trace_line(&value).unwrap(), r#"{"a":[true,null],"b":1}"#);
    }

    #[test]
    fn pyjson_keeps_insertion_order_and_spaces() {
        let value = json!({"b": 1, "a": "x"});
        assert_eq!(pyjson(&value).unwrap(), r#"{"b": 1, "a": "x"}"#);
    }

    #[test]
    fn non_ascii_is_escaped_the_way_python_escapes_it() {
        assert_eq!(trace_line(&json!("é→")).unwrap(), r#""\u00e9\u2192""#);
    }

    #[test]
    fn characters_beyond_the_bmp_use_surrogate_pairs() {
        assert_eq!(trace_line(&json!("😀")).unwrap(), r#""\ud83d\ude00""#);
    }

    #[test]
    fn floats_are_refused_not_printed() {
        assert!(trace_line(&json!(1.5)).is_err());
        assert!(trace_line(&json!({"cost": 1.0})).is_err());
    }
}
