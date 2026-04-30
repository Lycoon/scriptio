import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

type MetricsBundle = {
    registry: Registry;
    httpRequestsTotal: Counter<"method" | "route" | "status">;
    httpRequestDurationSeconds: Histogram<"method" | "route" | "status">;
    dbSizeBytes: Gauge<string>;
};

declare global {
    var __scriptio_metrics__: MetricsBundle | undefined;
}

const buildMetrics = (): MetricsBundle => {
    const registry = new Registry();
    collectDefaultMetrics({ register: registry });

    const httpRequestsTotal = new Counter({
        name: "http_requests_total",
        help: "Total HTTP requests handled by apiHandler.",
        labelNames: ["method", "route", "status"] as const,
        registers: [registry],
    });

    const httpRequestDurationSeconds = new Histogram({
        name: "http_request_duration_seconds",
        help: "HTTP request latency in seconds.",
        labelNames: ["method", "route", "status"] as const,
        registers: [registry],
    });

    const dbSizeBytes = new Gauge({
        name: "scriptio_db_size_bytes",
        help: "Current size of the application database in bytes.",
        registers: [registry],
    });

    return { registry, httpRequestsTotal, httpRequestDurationSeconds, dbSizeBytes };
};

const metrics = globalThis.__scriptio_metrics__ ?? buildMetrics();

if (process.env.NODE_ENV !== "production") globalThis.__scriptio_metrics__ = metrics;

export const { registry, httpRequestsTotal, httpRequestDurationSeconds, dbSizeBytes } = metrics;
