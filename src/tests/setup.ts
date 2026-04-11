// Stub Worker globally — spellcheck bench provides its own sync mock per-bench.
class StubWorker {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    terminate() {}
}
(globalThis as any).Worker = StubWorker;

// Suppress per-transaction console output from extensions globally.
// beforeEach does not cover bench() cases in vitest browser mode.
console.log = () => {};
console.warn = () => {};
