// Empty stub used to satisfy the Node-only `require("fs" | "path" | "crypto")`
// calls inside the Piper phonemizer's emscripten module when it is bundled for
// the browser. Those calls live behind an `if (ENVIRONMENT_IS_NODE)` guard that
// never runs in the browser, so an empty module is safe — see next.config.ts.
const emptyModule = {};
export default emptyModule;
