// Entry for `node --test site/assets/core/test/`: loads every test file in this folder (Node 22 runs a
// directory argument as a module, so the folder needs an entry that imports the tests).
import "./store.test.mjs";
import "./shell.test.mjs";
