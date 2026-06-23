#!/usr/bin/env node
/**
 * Merge multiple bench-results.json files into one.
 * Usage: node scripts/merge-bench.mjs <file1> <file2> ... > merged.json
 * Later files overwrite keys from earlier ones (last-writer-wins per group key).
 */

import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length < 2) {
    console.error("Usage: merge-bench.mjs <file1> <file2> ...");
    process.exit(1);
}

const merged = { generated: new Date().toISOString(), grouped: {} };

for (const file of files) {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    Object.assign(merged.grouped, data.grouped);
}

console.log(JSON.stringify(merged, null, 2));
