"""Generate the shared design-exploration fixture (director-owned, throwaway).

One scripted run of the B2 incident ("the almost-done spiral") as trace events,
plus 20 seeded trials on the old board (one exit) and the new board (turn
limit + token budget). Prices are illustrative relative units, not facts.
Run: python3 site/proto/shared/make_fixture.py
"""
import json
import random
from pathlib import Path

IN_PRICE, OUT_PRICE = 3.0, 15.0  # illustrative units per million tokens
SYSTEM_TOKENS, TOOLS_TOKENS, TASK_TOKENS = 900, 520, 40


def cost(tok_in, tok_out):
    return round(tok_in * IN_PRICE / 1e6 + tok_out * OUT_PRICE / 1e6, 5)


def spiral_events():
    ev, t, seq, history = [], 0.0, 0, 0
    run_tokens_in = run_tokens_out = 0
    total_cost = 0.0

    def add(kind, wire, turn, **kw):
        nonlocal seq
        e = {"v": 1, "run": "b2-spiral", "seq": seq, "t": round(t, 1), "turn": turn,
             "agent": "main", "kind": kind, "wire": wire}
        e.update(kw)
        ev.append(e)
        seq += 1

    add("run_start", "loop", 0, task="Fix the failing test in calc.py", board="old: one exit")
    script = [
        ("I'll read the file first.", ("read_file", {"path": "calc.py"}, True, 60, "def add(a, b):\n    return a - b\n\ndef total(xs):\n    return sum(xs) + 1\n")),
        ("The bug is in add(). Fixing it.", ("edit_file", {"path": "calc.py", "old_text": "a - b", "new_text": "a + b"}, True, 12, "Edited calc.py (1 change)")),
        ("Running the tests.", ("run_command", {"cmd": "pytest -q"}, False, 180, "1 failed, 3 passed: test_total expected 6, got 7")),
    ]
    loop_texts = ["Almost done: one more fix.", "Nearly there. Adjusting total().",
                  "One last change should do it.", "Almost done. Re-running the tests."]
    loop_tools = [("edit_file", {"path": "calc.py", "old_text": "sum(xs) + 1", "new_text": "sum(xs) - 1"}, True, 12, "Edited calc.py (1 change)"),
                  ("run_command", {"cmd": "pytest -q"}, False, 180, "1 failed, 3 passed: test_total expected 6, got 5"),
                  ("edit_file", {"path": "calc.py", "old_text": "sum(xs) - 1", "new_text": "sum(xs) + 1"}, True, 12, "Edited calc.py (1 change)"),
                  ("run_command", {"cmd": "pytest -q"}, False, 180, "1 failed, 3 passed: test_total expected 6, got 7")]
    turns = 14
    for turn in range(1, turns + 1):
        if turn <= 3:
            say, tool = script[turn - 1]
        else:
            say = loop_texts[(turn - 4) % len(loop_texts)]
            tool = loop_tools[(turn - 4) % len(loop_tools)]
        prompt = SYSTEM_TOKENS + TOOLS_TOKENS + TASK_TOKENS + history
        add("prompt_built", "control", turn, layers=["system", "tools", "history", "task"], tokens=prompt)
        add("model_call", "loop", turn, model="scripted", tokens_in=prompt)
        t += 2.4 + (turn % 3) * 0.4
        out = 70 + (turn * 7) % 40
        run_tokens_in += prompt
        run_tokens_out += out
        total_cost += cost(prompt, out)
        name, args, ok, out_tokens, output = tool
        add("model_reply", "loop", turn, stop_reason="tool_use", text=say,
            usage={"input_tokens": prompt, "output_tokens": out}, cost=round(total_cost, 5),
            tool_use={"id": f"toolu_{turn:02d}", "name": name, "input": args})
        add("permission", "permissions", turn, tool=name, decision="allow",
            rule="practice folder: allow all", reason="no rules configured")
        t += 0.3 if name != "run_command" else 2.8
        add("tool_call", "tools", turn, tool=name, input=args, ok=ok, output=output,
            output_tokens=out_tokens, tool_use_id=f"toolu_{turn:02d}")
        history += out + out_tokens + 40
    t += 6.0
    add("interrupt", "loop", turns, by="human", note="Operator stopped the run after 14 turns")
    add("run_end", "loop", turns, status="interrupted", turns=turns,
        tokens={"input": run_tokens_in, "output": run_tokens_out}, cost=round(total_cost, 5))
    return ev


def run_cost(turns):
    tok_in = sum(SYSTEM_TOKENS + TOOLS_TOKENS + TASK_TOKENS + k * 300 for k in range(turns))
    return cost(tok_in, turns * 85)


def trial(rng, board, limit=12):
    fixes = rng.random() < 0.6
    needs = rng.choice([4, 4, 5, 5, 6])          # turns this trial needs if it fixes the bug
    human_stop = rng.randint(28, 46)             # when a human would notice a runaway run
    if fixes and needs <= (limit if board == "new" else 999):
        turns, status = needs, "done"
    elif board == "old":
        turns, status = (needs, "done") if fixes else (human_stop, "interrupted")
    else:
        turns, status = limit, "max_turns"
    tok_in = sum(SYSTEM_TOKENS + TOOLS_TOKENS + TASK_TOKENS + k * 300 for k in range(turns))
    tok_out = turns * 85
    return {"status": status, "passed": status == "done", "turns": turns,
            "tokens": tok_in + tok_out, "cost": cost(tok_in, tok_out),
            "fixes": fixes, "needs": needs, "human_stop": human_stop}


def bench():
    out = {}
    for board in ("old", "new"):
        # One PRNG per trial, seeded the same on both boards (SPEC 7.3): the model's
        # behavior is identical, so any difference comes from the harness alone.
        out[board] = [dict(trial(random.Random(20261010 + i), board), seed=20261010 + i)
                      for i in range(20)]
    return out


if __name__ == "__main__":
    data = {"note": "Design exploration fixture. Prices are illustrative relative units.",
            "trace": spiral_events(), "bench": bench(),
            "incident": {"family": "almost-done-spiral", "family_name": "The \u201calmost done\u201d spiral",
                         "wire": "loop", "first_bad_seq": 30,
                         "why": "At turn 6 the model undoes its own turn-4 edit. From here it swaps "
                                "+ 1 and - 1 forever and never tries removing it, and the loop has "
                                "no exit except the model saying it is done.",
                         "fixes": ["Add a turn limit and a token budget to the loop",
                                   "Tell the model to try harder in the system prompt",
                                   "Switch to a bigger model", "Retry the run"],
                         "correct_fix": 0,
                         "prediction": {"question": "How does this run end?",
                                        "options": ["It fixes the bug and stops after a few turns.",
                                                    "It says it is done too early.",
                                                    "It never stops on its own.",
                                                    "It crashes on an error."],
                                        "answer": 2}},
            "puzzle": {"rule": "A trial passes if it fixes the bug and needs <= limit turns; "
                       "otherwise the new board stops it at the limit. Cost of a run with n turns "
                       "is cost_by_turns[n].",
                       "cost_by_turns": {str(n): run_cost(n) for n in range(1, 61)},
                       "limit_range": [2, 30], "par": {"limit": 6, "note": "lowest worst-case cost with no lost pass"}},
            "boards": {"old": {"label": "Old board", "exits": ["model says done"]},
                       "new": {"label": "New board", "exits": ["model says done", "turn limit 12", "token budget 60k"]}}}
    p = Path(__file__).with_name("fixture.json")
    p.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    js = Path(__file__).with_name("fixture.js")
    js.write_text("export const FIXTURE = " + json.dumps(data) + ";\n", encoding="utf-8")
    b = data["bench"]
    for k in ("old", "new"):
        passed = sum(x["passed"] for x in b[k])
        print(k, f"pass {passed}/20", "max turns", max(x["turns"] for x in b[k]),
              "max cost", max(x["cost"] for x in b[k]), "mean cost", round(sum(x["cost"] for x in b[k]) / 20, 4))
    print("trace events", len(data["trace"]), "final", data["trace"][-1]["cost"])
