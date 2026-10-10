// Copies the Pyodide core that the browser needs from node_modules/pyodide to site/vendor/pyodide/
// (D-015). The copy is never committed (.gitignore); the Pages workflow runs this script at deploy.
// Only the core is copied: no packages. The version must be the D-018 pin.
// Hosts must serve .wasm as application/wasm: WebAssembly.instantiateStreaming needs that type.
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PIN = "314.0.7";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const from = path.join(root, "node_modules", "pyodide");
const to = path.join(root, "site", "vendor", "pyodide");
// The files pyodide.mjs loads at runtime (the asm module and wasm, the stdlib zip, the lock file).
const FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

const installed = JSON.parse(await readFile(path.join(from, "package.json"), "utf8")).version;
if (installed !== PIN) {
  console.error(`copy_pyodide: node_modules/pyodide is ${installed}, the pin is ${PIN}. Run npm ci.`);
  process.exit(2);
}
await mkdir(to, { recursive: true });
let total = 0;
for (const name of FILES) {
  await copyFile(path.join(from, name), path.join(to, name));
  total += (await stat(path.join(to, name))).size;
}
const mb = (total / 1048576).toFixed(1);
console.log(`copy_pyodide: ${FILES.length} files, ${total} bytes (${mb} MB) to site/vendor/pyodide/`);
