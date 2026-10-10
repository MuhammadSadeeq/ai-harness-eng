// Generated from course.json for the v2 prototype (wires, parts, path, sockets).
// Colours are not stored here: wire colours come from site/assets/core/tokens.css.

export const WIRES = [
 {
  "id": "control",
  "n": 1,
  "name": "Control plane",
  "short": "Control",
  "clock": "12",
  "angle": 0,
  "glyph": "layers",
  "dash": "",
  "width": 2,
  "round": false,
  "question": "What is the model told, and which instruction wins?",
  "law": "Words guide, code enforces."
 },
 {
  "id": "context",
  "n": 2,
  "name": "Context & memory",
  "short": "Context",
  "clock": "1–2",
  "angle": 45,
  "glyph": "window",
  "dash": "10 4",
  "width": 2,
  "round": false,
  "question": "What is on the desk this call, and what is saved?",
  "law": "The smallest window that works."
 },
 {
  "id": "loop",
  "n": 3,
  "name": "Loop & state",
  "short": "Loop",
  "clock": "3",
  "angle": 90,
  "glyph": "cycle",
  "dash": "",
  "width": 3.5,
  "round": false,
  "question": "What happens next, what do we carry, when do we stop?",
  "law": "Every run needs more than one exit."
 },
 {
  "id": "errors",
  "n": 4,
  "name": "Errors & recovery",
  "short": "Errors",
  "clock": "4–5",
  "angle": 135,
  "glyph": "zigzag",
  "dash": "8 3 2 3",
  "width": 2,
  "round": false,
  "question": "When something fails, how do we continue without spinning?",
  "law": "Errors are the main path."
 },
 {
  "id": "tools",
  "n": 5,
  "name": "Tools",
  "short": "Tools",
  "clock": "6",
  "angle": 180,
  "glyph": "hexagon",
  "dash": "4 3",
  "width": 2,
  "round": false,
  "question": "What can the model do, and is each tool easy to use?",
  "law": "A tool is a user interface for a model."
 },
 {
  "id": "permissions",
  "n": 6,
  "name": "Permissions & sandbox",
  "short": "Permissions",
  "clock": "7–8",
  "angle": 225,
  "glyph": "diamond",
  "dash": "8 3 2 3 2 3",
  "width": 2,
  "round": false,
  "question": "Which actions are allowed, and how bad can a mistake get?",
  "law": "Judge the action and its target."
 },
 {
  "id": "verify",
  "n": 7,
  "name": "Verification & evals",
  "short": "Verification",
  "clock": "9–10",
  "angle": 285,
  "glyph": "shield",
  "dash": "0.1 4",
  "width": 2.5,
  "round": true,
  "question": "How do we know it's really done, and did the change help?",
  "law": "“Done” is a claim."
 },
 {
  "id": "observe",
  "n": 8,
  "name": "Observability",
  "short": "Observability",
  "clock": "11 (rim)",
  "angle": 330,
  "glyph": "eye",
  "dash": "2 2",
  "width": 1.5,
  "round": false,
  "question": "What exactly happened, and where did time and money go?",
  "law": "If it isn't in the trace, it didn't happen."
 }
];

export const PARTS = [
 {
  "id": "S",
  "title": "Start here",
  "modules": [
   {
    "id": "S0",
    "title": "Same model, different harness",
    "minutes": 25,
    "kind": "concept"
   }
  ]
 },
 {
  "id": "A",
  "title": "The model",
  "modules": [
   {
    "id": "A1",
    "title": "What a model does",
    "minutes": 30,
    "kind": "concept"
   },
   {
    "id": "A2",
    "title": "Tokens and the context window",
    "minutes": 30,
    "kind": "concept"
   },
   {
    "id": "A3",
    "title": "The stateless model",
    "minutes": 40,
    "kind": "core"
   },
   {
    "id": "A4",
    "title": "The API call on the wire",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "A5",
    "title": "Structured outputs and schemas",
    "minutes": 45,
    "kind": "core"
   },
   {
    "id": "A6",
    "title": "Reasoning and effort as harness knobs",
    "minutes": 35,
    "kind": "concept"
   },
   {
    "id": "A7",
    "title": "Why a model alone is unreliable",
    "minutes": 30,
    "kind": "concept"
   }
  ]
 },
 {
  "id": "B",
  "title": "From chatbot to agent",
  "modules": [
   {
    "id": "B1",
    "title": "Tools give the model hands",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "B2",
    "title": "The agent loop",
    "minutes": 60,
    "kind": "core"
   },
   {
    "id": "B3",
    "title": "What a harness is",
    "minutes": 35,
    "kind": "concept"
   },
   {
    "id": "B4",
    "title": "The Turn Clock",
    "minutes": 30,
    "kind": "concept"
   }
  ]
 },
 {
  "id": "C",
  "title": "The eight wires",
  "modules": [
   {
    "id": "C1",
    "title": "Control plane: instructions as law",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "C2",
    "title": "Context budget",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "C3",
    "title": "Compaction and memory",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "C4",
    "title": "Prompt caching",
    "minutes": 45,
    "kind": "core"
   },
   {
    "id": "C5",
    "title": "Loop state and stopping well",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "C6",
    "title": "Errors are the main path",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "C7",
    "title": "Tool design is agent UX",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "C8",
    "title": "MCP, skills and tool scale",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "C9",
    "title": "Permissions",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "C10",
    "title": "Sandboxes: blast walls",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "C11",
    "title": "Verification: done is a claim",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "C12",
    "title": "Observability: traces you can read",
    "minutes": 50,
    "kind": "core"
   }
  ]
 },
 {
  "id": "D",
  "title": "Measure",
  "modules": [
   {
    "id": "D1",
    "title": "Eval anatomy",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "D2",
    "title": "Statistics for a random system",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "D3",
    "title": "Evals in practice",
    "minutes": 55,
    "kind": "core"
   }
  ]
 },
 {
  "id": "E",
  "title": "Secure",
  "modules": [
   {
    "id": "E1",
    "title": "Prompt injection and the lethal trifecta",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "E2",
    "title": "Defense in layers",
    "minutes": 50,
    "kind": "core"
   }
  ]
 },
 {
  "id": "F",
  "title": "Scale",
  "modules": [
   {
    "id": "F1",
    "title": "Many agents: when and how",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "F2",
    "title": "Long-running agents",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "F3",
    "title": "Managed agents: the harness as a service",
    "minutes": 35,
    "kind": "concept"
   },
   {
    "id": "F4",
    "title": "Cost and latency engineering",
    "minutes": 50,
    "kind": "core"
   },
   {
    "id": "F5",
    "title": "Production: agents that survive real traffic",
    "minutes": 55,
    "kind": "core"
   },
   {
    "id": "F6",
    "title": "Environments: harnesses that train and test models",
    "minutes": 60,
    "kind": "core"
   },
   {
    "id": "F7",
    "title": "Model migrations: when the model changes under you",
    "minutes": 50,
    "kind": "core"
   }
  ]
 },
 {
  "id": "G",
  "title": "Real harnesses",
  "modules": [
   {
    "id": "G1",
    "title": "Inside Claude Code, wire by wire",
    "minutes": 40,
    "kind": "concept"
   },
   {
    "id": "G2",
    "title": "Codex and open harnesses: what everyone agrees on",
    "minutes": 40,
    "kind": "concept"
   },
   {
    "id": "G3",
    "title": "Reading a real harness repository",
    "minutes": 60,
    "kind": "concept"
   },
   {
    "id": "G4",
    "title": "The daily craft",
    "minutes": 50,
    "kind": "core"
   }
  ]
 },
 {
  "id": "H",
  "title": "Build Rein",
  "modules": [
   {
    "id": "H0",
    "title": "Rein setup",
    "minutes": 20,
    "kind": "guide"
   },
   {
    "id": "H1",
    "title": "Rein 1: talk to a model",
    "minutes": 35,
    "kind": "build"
   },
   {
    "id": "H2",
    "title": "Rein 2: one tool and the loop",
    "minutes": 40,
    "kind": "build"
   },
   {
    "id": "H3",
    "title": "Rein 3: real tools inside a wall",
    "minutes": 45,
    "kind": "build"
   },
   {
    "id": "H4",
    "title": "Rein 4: the permission gate",
    "minutes": 40,
    "kind": "build"
   },
   {
    "id": "H5",
    "title": "Rein 5: a trace",
    "minutes": 35,
    "kind": "build"
   },
   {
    "id": "H6",
    "title": "Rein 6: a context budget",
    "minutes": 40,
    "kind": "build"
   },
   {
    "id": "H7",
    "title": "Rein 7: retries and a breaker",
    "minutes": 45,
    "kind": "build"
   },
   {
    "id": "H8",
    "title": "Rein 8: guards that stop the run well",
    "minutes": 40,
    "kind": "build"
   },
   {
    "id": "H9",
    "title": "Rein 9: the verification gate",
    "minutes": 40,
    "kind": "build"
   },
   {
    "id": "H10",
    "title": "Rein 10: project rules",
    "minutes": 35,
    "kind": "build"
   },
   {
    "id": "H11",
    "title": "Rein 11: a reviewer sub-agent",
    "minutes": 45,
    "kind": "build"
   },
   {
    "id": "H12",
    "title": "From one file to a project",
    "minutes": 90,
    "kind": "guide"
   },
   {
    "id": "H13",
    "title": "Rein extensions, ranked",
    "minutes": 30,
    "kind": "guide"
   }
  ]
 },
 {
  "id": "I",
  "title": "Get hired",
  "modules": [
   {
    "id": "I1",
    "title": "The job map",
    "minutes": 30,
    "kind": "career"
   },
   {
    "id": "I2",
    "title": "Readiness self-assessment",
    "minutes": 30,
    "kind": "career"
   },
   {
    "id": "I3",
    "title": "Four portfolio projects",
    "minutes": 45,
    "kind": "career"
   },
   {
    "id": "I4",
    "title": "Interview Room",
    "minutes": 120,
    "kind": "career"
   },
   {
    "id": "I5",
    "title": "Twelve weeks after the course",
    "minutes": 30,
    "kind": "career"
   }
  ]
 },
 {
  "id": "T",
  "title": "Toolbelt",
  "modules": [
   {
    "id": "T1",
    "title": "Python typing and dataclasses",
    "minutes": 20,
    "kind": "primer"
   },
   {
    "id": "T2",
    "title": "asyncio",
    "minutes": 25,
    "kind": "primer"
   },
   {
    "id": "T3",
    "title": "subprocess and signals",
    "minutes": 20,
    "kind": "primer"
   },
   {
    "id": "T4",
    "title": "JSON Schema in depth",
    "minutes": 20,
    "kind": "primer"
   },
   {
    "id": "T5",
    "title": "HTTP and SSE streaming",
    "minutes": 20,
    "kind": "primer"
   },
   {
    "id": "T6",
    "title": "pytest",
    "minutes": 20,
    "kind": "primer"
   },
   {
    "id": "T7",
    "title": "Containers",
    "minutes": 25,
    "kind": "primer"
   },
   {
    "id": "T8",
    "title": "git for agent work",
    "minutes": 20,
    "kind": "primer"
   },
   {
    "id": "T9",
    "title": "Linux processes",
    "minutes": 20,
    "kind": "primer"
   },
   {
    "id": "T10",
    "title": "Threads vs. async",
    "minutes": 20,
    "kind": "primer"
   }
  ]
 }
];

export const PATH = [
 "S0",
 "A1",
 "A2",
 "A3",
 "A4",
 "A5",
 "A6",
 "A7",
 "B1",
 "B2",
 "H0",
 "H1",
 "H2",
 "B3",
 "B4",
 "C1",
 "C2",
 "C3",
 "C4",
 "C5",
 "C6",
 "C7",
 "C8",
 "C9",
 "C10",
 "H3",
 "H4",
 "H5",
 "H6",
 "H7",
 "H8",
 "C11",
 "H9",
 "H10",
 "H11",
 "C12",
 "D1",
 "D2",
 "D3",
 "H12",
 "E1",
 "E2",
 "F1",
 "F2",
 "F3",
 "F4",
 "F5",
 "F6",
 "F7",
 "G1",
 "G2",
 "G3",
 "G4",
 "H13",
 "I1",
 "I2",
 "I3",
 "I4",
 "I5"
];

export const PROGRESS = {
 "done": [
  "S0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "B1"
 ],
 "current": "B2"
};

export const PLUGGED = {
 "context": {
  "id": "A3",
  "title": "history resend"
 },
 "loop": {
  "id": "A4",
  "title": "block-aware reply parser"
 }
};

export const SOCKETS = {
 "control": {
  "id": "C1",
  "title": "Control plane: instructions as law"
 },
 "context": {
  "id": "C2",
  "title": "Context budget"
 },
 "loop": {
  "id": "B2",
  "title": "turn limit"
 },
 "errors": {
  "id": "C6",
  "title": "Errors are the main path"
 },
 "tools": {
  "id": "C7",
  "title": "Tool design is agent UX"
 },
 "permissions": {
  "id": "C9",
  "title": "Permissions"
 },
 "verify": {
  "id": "C11",
  "title": "Verification: done is a claim"
 },
 "observe": {
  "id": "H5",
  "title": "Rein 5: a trace"
 }
};

export const PRODUCT_TAGLINE = "From zero to a hireable AI harness engineer, one replayable run at a time.";
