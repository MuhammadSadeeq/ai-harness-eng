// The page context the shell hands to components (docs/COMPONENTS.md §4–5). app.js calls setContext()
// once, before it loads any component; components read it with hxContext(). Without a shell (a unit
// test, a bare demo) the context is a harmless stand-in: no store, announcements go nowhere.
let current = null;

const STANDIN = Object.freeze({ store: null, announce: () => {} });

export function setContext(context) {
  current = Object.freeze({ ...STANDIN, ...context });
}

export function hxContext() {
  return current ?? STANDIN;
}
