//! Canonical JSON (ENGINE.md sections 1, 2, 10). `pyjson` is Python's json.dumps defaults (the
//! token estimate's form); `trace_line` is a trace file's line (sorted keys, compact).

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

pub fn trace_line(value: &Value) -> Result<String, String> {
    render(value, TRACE)
}

pub fn pyjson(value: &Value) -> Result<String, String> {
    render(value, PYJSON)
}

/// tokens(x) = floor(len(pyjson(x)) / 4) (ENGINE.md section 4).
pub fn tokens(value: &Value) -> Result<i64, String> {
    let text = pyjson(value)?;
    Ok((text.len() / 4) as i64)
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
            None => return Err(format!("{number} is not an integer (ENGINE.md section 1)")),
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
    use super::{pyjson, tokens, trace_line};
    use serde_json::json;

    #[test]
    fn trace_lines_sort_keys_and_stay_compact() {
        assert_eq!(trace_line(&json!({"b": 1, "a": [true, null]})).unwrap(), r#"{"a":[true,null],"b":1}"#);
    }

    #[test]
    fn pyjson_keeps_order_and_spaces_and_tokens_count_its_bytes() {
        let value = json!({"b": 1, "a": "x"});
        assert_eq!(pyjson(&value).unwrap(), r#"{"b": 1, "a": "x"}"#);
        assert_eq!(tokens(&value).unwrap(), 18 / 4);
    }

    #[test]
    fn non_ascii_and_floats() {
        let input = "\u{e9}\u{2192}";
        let escaped = format!("\"{}\"", "\\u00e9\\u2192");
        assert_eq!(trace_line(&json!(input)).unwrap(), escaped);
        assert!(trace_line(&json!(1.5)).is_err());
    }
}
