#!/usr/bin/env node
/**
 * Compare two bench-results.json files and output an HTML regression report.
 * Usage: node scripts/compare-bench.mjs <baseline.json> <current.json>
 * Exit code 1 if regressions are found, 0 otherwise.
 * Pipe stdout to $GITHUB_STEP_SUMMARY to render in GitHub Actions.
 */

import { readFileSync } from "node:fs";

const REGRESSION_THRESHOLD = 0.20;
const WARNING_THRESHOLD = 0.10;
const IMPROVEMENT_THRESHOLD = 0.10;

const [, , baselinePath, currentPath] = process.argv;
if (!baselinePath || !currentPath) {
    console.error("Usage: compare-bench.mjs <baseline.json> <current.json>");
    process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));
const current  = JSON.parse(readFileSync(currentPath,  "utf-8"));

function flatten(data) {
    const map = new Map();
    for (const [groupKey, entries] of Object.entries(data.grouped)) {
        for (const entry of entries) {
            map.set(`${groupKey} > ${entry.name}`, entry);
        }
    }
    return map;
}

const baseMap = flatten(baseline);
const currMap = flatten(current);

const rows = [];
for (const [key, curr] of currMap) {
    const base = baseMap.get(key);
    if (!base) { rows.push({ key, kind: "new",  curr, base: null, pct: null }); continue; }
    const pct = (curr.meanMs - base.meanMs) / base.meanMs;
    const kind =
        pct >= REGRESSION_THRESHOLD   ? "regression" :
        pct >= WARNING_THRESHOLD      ? "warning"    :
        pct <= -IMPROVEMENT_THRESHOLD ? "improvement": "stable";
    rows.push({ key, kind, curr, base, pct });
}

const regressions  = rows.filter(r => r.kind === "regression");
const warnings     = rows.filter(r => r.kind === "warning");
const improvements = rows.filter(r => r.kind === "improvement");
const stable       = rows.filter(r => r.kind === "stable");
const newTests     = rows.filter(r => r.kind === "new");

// ── Formatting helpers ────────────────────────────────────────────────────────

function esc(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function fmtMs(ms) {
    return ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(2)} ms`;
}

function fmtPct(pct) {
    if (pct === null) return "—";
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${(pct * 100).toFixed(1)}%`;
}

// ── Style constants ───────────────────────────────────────────────────────────

const COLORS = {
    regression:  { row: "#3d0000", border: "#ff4444", badge: "#ff4444", text: "#ff9999" },
    warning:     { row: "#2d1a00", border: "#ff9500", badge: "#ff9500", text: "#ffcc66" },
    improvement: { row: "#002200", border: "#22c55e", badge: "#22c55e", text: "#86efac" },
    stable:      { row: "transparent", border: "transparent", badge: "#555", text: "#aaa" },
    new:         { row: "#001a2d", border: "#38bdf8", badge: "#38bdf8", text: "#7dd3fc" },
};

const LABELS = {
    regression:  "REGRESSION",
    warning:     "SLOW",
    improvement: "FASTER",
    stable:      "OK",
    new:         "NEW",
};

function badge(kind) {
    const c = COLORS[kind];
    return `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;background:${c.badge};color:#000;">${LABELS[kind]}</span>`;
}

const TH = (label) =>
    `<th style="padding:6px 10px;text-align:left;font-size:12px;color:#8b949e;font-weight:600;border-bottom:1px solid #30363d;white-space:nowrap;">${label}</th>`;

function tableRow(row) {
    const { kind, curr, base, pct } = row;
    const c = COLORS[kind];
    const rowStyle = `background:${c.row};border-left:3px solid ${c.border};`;
    const td = (val, mono = false) =>
        `<td style="padding:5px 10px;font-size:12px;${mono ? "font-family:monospace;" : ""}color:#e6edf3;white-space:nowrap;">${val}</td>`;
    const deltaStyle = `padding:5px 10px;font-size:12px;font-family:monospace;color:${c.text};font-weight:600;white-space:nowrap;`;

    return [
        `<tr style="${rowStyle}">`,
        td(badge(kind)),
        td(esc(curr.browser)),
        td(esc(curr.suite)),
        td(esc(curr.name)),
        td(base ? fmtMs(base.meanMs) : "—", true),
        td(fmtMs(curr.meanMs), true),
        `<td style="${deltaStyle}">${fmtPct(pct)}</td>`,
        `</tr>`,
    ].join("");
}

function table(rows) {
    return `
<table style="width:100%;border-collapse:collapse;background:#0d1117;border:1px solid #30363d;border-radius:6px;overflow:hidden;">
  <thead>
    <tr style="background:#161b22;">
      ${["", "Browser", "Suite", "Test", "Baseline", "Current", "Δ"].map(TH).join("")}
    </tr>
  </thead>
  <tbody>
    ${rows.map(tableRow).join("\n    ")}
  </tbody>
</table>`;
}

function statPill(count, label, color) {
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;border:1px solid ${color};font-size:13px;color:${color};font-weight:600;">`
        + `<strong>${count}</strong> ${label}</span>`;
}

// ── Build HTML ────────────────────────────────────────────────────────────────

const hasIssues = regressions.length > 0 || warnings.length > 0;

const bannerBg    = regressions.length ? "#3d0000" : warnings.length ? "#2d1a00" : "#002200";
const bannerBorder= regressions.length ? "#ff4444" : warnings.length ? "#ff9500" : "#22c55e";
const bannerText  = regressions.length
    ? `🚨 ${regressions.length} regression${regressions.length > 1 ? "s" : ""} detected`
    : warnings.length
    ? `⚠️ ${warnings.length} warning${warnings.length > 1 ? "s" : ""} — no hard regressions`
    : "✅ No regressions detected";

const allSorted = [...regressions, ...warnings, ...stable, ...improvements, ...newTests];

const html = `
<h2 style="font-size:18px;margin-bottom:8px;">Benchmark Results</h2>

<p style="font-size:12px;color:#8b949e;margin:0 0 12px;">
  Baseline: <code>${esc(baseline.generated)}</code> &rarr; Current: <code>${esc(current.generated)}</code><br>
  Thresholds: regression &gt;${REGRESSION_THRESHOLD * 100}%  &middot;  warning &gt;${WARNING_THRESHOLD * 100}%  &middot;  improvement &gt;${IMPROVEMENT_THRESHOLD * 100}% faster
</p>

<div style="padding:10px 16px;margin-bottom:16px;border-radius:6px;border-left:4px solid ${bannerBorder};background:${bannerBg};font-size:14px;font-weight:700;color:#e6edf3;">
  ${bannerText}
</div>

<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
  ${statPill(regressions.length,  "regression(s)",  "#ff4444")}
  ${statPill(warnings.length,     "warning(s)",     "#ff9500")}
  ${statPill(improvements.length, "improvement(s)", "#22c55e")}
  ${statPill(stable.length,       "stable",         "#555")}
  ${statPill(newTests.length,     "new",            "#38bdf8")}
</div>

${hasIssues ? `
<h3 style="font-size:14px;margin:0 0 8px;color:#e6edf3;">Regressions &amp; Warnings</h3>
${table([...regressions, ...warnings])}
<br>` : ""}

${improvements.length > 0 ? `
<h3 style="font-size:14px;margin:0 0 8px;color:#e6edf3;">Improvements</h3>
${table(improvements)}
<br>` : ""}

<details>
<summary style="cursor:pointer;font-size:13px;color:#8b949e;margin-bottom:8px;">
  All results (${rows.length} benchmarks)
</summary>
${table(allSorted)}
</details>
`.trim();

console.log(html);
process.exit(regressions.length > 0 ? 1 : 0);
