/**
 * Custom Vitest benchmark reporter that writes results to bench-results.json.
 * Uses onTaskUpdate to capture benchmark data as it arrives from the browser,
 * and onCollected to build the id→{name,suite,browser} lookup map.
 */
import { BenchmarkReporter } from "vitest/reporters";
import type { RunnerTestFile, RunnerTask, RunnerTaskResultPack } from "vitest";
import { writeFileSync } from "node:fs";

interface TaskMeta {
    name: string;
    suite: string;
    browser: string;
}

interface BenchEntry extends TaskMeta {
    hz: number;
    /** milliseconds per operation */
    meanMs: number;
    minMs: number;
    maxMs: number;
    p75Ms: number;
    p99Ms: number;
    rme: number;
    samples: number;
}

type TaskWithChildren = RunnerTask & { tasks?: RunnerTask[] };

export default class BenchJsonReporter extends BenchmarkReporter {
    /** id → task metadata (populated in onCollected) */
    private readonly taskMeta = new Map<string, TaskMeta>();
    /** id → benchmark result (populated in onTaskUpdate) */
    private readonly benchData = new Map<string, BenchEntry>();

    // ── Phase 1: index all tasks so we can look them up by id later ─────────
    onCollected(files: RunnerTestFile[] = []) {
        for (const file of files) {
            const browser =
                (file as unknown as { projectName?: string }).projectName ?? "unknown";
            this.indexTasks(file.tasks as RunnerTask[], "", browser);
        }
    }

    private indexTasks(tasks: RunnerTask[], suitePath: string, browser: string) {
        for (const task of tasks) {
            this.taskMeta.set(task.id, { name: task.name, suite: suitePath, browser });
            const sub = (task as TaskWithChildren).tasks;
            if (sub?.length) {
                const childPath = suitePath ? `${suitePath} > ${task.name}` : task.name;
                this.indexTasks(sub, childPath, browser);
            }
        }
    }

    // ── Phase 2: capture benchmark results as they stream in ─────────────────
    onTaskUpdate(packs: RunnerTaskResultPack[]) {
        for (const [id, result] of packs) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bm = (result as any)?.benchmark;
            if (!bm || typeof bm.hz !== "number") continue;

            const meta = this.taskMeta.get(id);
            if (!meta) continue;

            this.benchData.set(id, {
                ...meta,
                hz: bm.hz,
                meanMs: bm.mean,
                minMs: bm.min,
                maxMs: bm.max,
                p75Ms: bm.p75,
                p99Ms: bm.p99,
                rme: bm.rme,
                samples: Array.isArray(bm.samples) ? bm.samples.length : (bm.sampleCount ?? 0),
            });
        }
    }

    // ── Phase 3: write JSON when everything has finished ─────────────────────
    async onFinished() {
        if (this.benchData.size === 0) return;

        const grouped: Record<string, BenchEntry[]> = {};
        for (const entry of this.benchData.values()) {
            const key = `[${entry.browser}] ${entry.suite}`;
            (grouped[key] ??= []).push(entry);
        }

        writeFileSync(
            "bench-results.json",
            JSON.stringify({ generated: new Date().toISOString(), grouped }, null, 2),
            "utf-8",
        );
        console.log(`\nBench results written to bench-results.json (${this.benchData.size} entries)`);
    }
}
