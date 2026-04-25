// Stub Worker globally — spellcheck bench provides its own sync mock per-bench.
class StubWorker {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    terminate() {}
}
(globalThis as Record<string, unknown>).Worker = StubWorker;

// Browser test runtime has no `process` — shim it so modules that read
// `process.env.NEXT_PUBLIC_*` at top level can load without crashing.
if (typeof (globalThis as Record<string, unknown>).process === "undefined") {
    (globalThis as Record<string, unknown>).process = { env: {} };
}

// Suppress per-transaction console output from extensions globally.
// beforeEach does not cover bench() cases in vitest browser mode.
console.log = () => {};
console.warn = () => {};
