# BLUEPRINT BP-3.1-labs: wave 3.1 labs: `hx-sampler`, `hx-tokenizer`, `hx-forgetful`, `hx-dice`

Phase 3, wave 3.1 platform. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. These labs serve A1, A2, A3 and A7; their module builders write the
content that feeds them, so each lab takes its data from a JSON `src` and ships
one demo data file.

## Read first
`docs/COMPONENTS.md` (all), `docs/DESIGN.md` §7.5–§7.7, §7.9, §7.10, §8, §9,
§11, `site/assets/components/lib/{hx-element,data,format}.js`,
`site/assets/sim/{prng,tokens}.js` (seeded draws; the course's token rule),
`site/assets/core/hx.css`, and one of the accepted components you did not
write (to match patterns). SPEC §6.2's table rows for these four labs.

## Shared rules
- Numbers that are not real measurements are labelled
  `Illustrative numbers, not from a real model.` under the figure (DESIGN §11).
- Every random draw uses the simulator's PRNG with a seed attribute (default 1),
  so a reload repeats exactly; a `New seed` key changes it and shows it.
- Charts draw at measured width; nothing under 14 px; marks plus words, never
  color alone; reduced motion: no tweening.
- Each lab: `selfTest()` drives the real UI; a demo page `site/labs/<name>.html`;
  module + CSS ≤ 40 KB; values protocol (COMPONENTS §10) for its main numbers.

## 1. `hx-sampler` (A1: sampling, temperature, confident lies)
`src` JSON: `{prompt, candidates: [{text, logit, correct?}], note?}`.
- Shows the prompt and the next-word candidates as horizontal bars with their
  probabilities, `softmax(logit / T)`; the top bar is marked "most likely".
- A temperature slider 0.0–2.0 (step 0.1) with − / + keys and a readout; at 0
  the choice is always the top candidate (state it in a line under the slider).
- `Pick a word` draws one with the PRNG and appends it to the prompt line;
  `Pick ×20` shows how often each word came up (counts beside the bars).
- When a candidate has `correct: false` and is the most likely, a line appears:
  `The most likely word is wrong here. Fluent is not the same as true.`
- Values: `temperature` (settable), `top_probability` (read-only, percent).

## 2. `hx-tokenizer` (A2: tokens and the window)
Attributes: `window` (tokens, default 8000), `text` (initial).
- A textarea; under it, live: characters, words, the **course estimate**
  `≈ N tokens` using the simulator's `tokens()` rule on the text (state the rule:
  `about 4 characters per token`), and an approximate split shown as chips
  (whitespace and punctuation boundaries, long words cut into 4-character
  pieces), labelled `An approximate split. Real tokenizers differ.`
- A desk bar: the text's share of the window, with `{pct}% of a {window}-token window`.
- Two preset buttons (`A short question`, `A 40 KB log`) fill the textarea from
  `src` JSON `{presets: [{label, text}]}` (the log preset can be generated:
  `{label, repeat: {line, times}}`).
- Values: `tokens` (read-only), `window` (settable).

## 3. `hx-forgetful` (A3: the model has no memory)
A small chat with a **rule-based stand-in model** (say so on screen:
`A scripted stand-in: it only knows what is in the request.`):
- The learner types messages (or picks suggested ones: `My name is Sam.`,
  `What is my name?`). Each turn the harness sends a request; a toggle
  `Resend the history` (on by default in the demo's second instance, off in the
  first) decides whether the request holds every earlier message or only the
  new one.
- Beside the chat, the request as a list of messages (role and text), and its
  token estimate, growing with history on, flat with it off.
- The stand-in's rules (`src` JSON `{rules: [{match, reply, remembers?}]}`; the
  demo: a "my name is X" fact and a "what is my name" question): it answers from
  the messages in **this** request only (`I don't know your name.` when the
  history wasn't sent).
- Values: `messages_sent` (read-only), `resend` (settable boolean as 0/1).

## 4. `hx-dice` (A7, D2: pass@k and pass^k)
Attributes: `p` (percent, default 90), `k` (default 3), `tasks` (default 20).
- Sliders for p (50–99 %) and k (1–10), each with − / + keys and readouts.
- Live formulas as readouts: `pass@k = 1 − (1 − p)^k` and `pass^k = p^k`, both
  as percents, with one sentence each in plain words (`at least one of k tries
  works`, `all k tries work`).
- `Roll` simulates `tasks` tasks of k tries with the PRNG: a grid of rows (one
  per task) of k dice (✓ / ✕ marks with words in their labels), then the
  observed pass@k and pass^k beside the formula values.
- A long-chain line for A7: `A 20-step task at {p}% per step finishes cleanly {p^20}% of the time.`
- Values: `p`, `k` (settable), `pass_at_k`, `pass_hat_k` (read-only, percent).

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/sampler.html labs/tokenizer.html labs/forgetful.html labs/dice.html
```
QA 0 failures with self-tests counted. View each at 375 and 1280, both themes.
Tell me which tags to register.

## Report
Files; checks and final lines; sizes; UI copy beyond the strings above; demo
data; deviations; open doubts. Don't commit.
