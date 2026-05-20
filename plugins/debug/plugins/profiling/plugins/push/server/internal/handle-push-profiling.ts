import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushProfiling } from "../../shared/endpoints";
import { readContentionRecords } from "./read-contention";

interface Span {
  id: string;
  phase: string;
  label: string;
  startMs: number;
  durationMs: number;
}

interface Phase {
  id: string;
  label: string;
  outcome: string;
  branch: string;
}

const DEFAULT_LIMIT = 20;

export const handlePushProfiling = implement(
  getPushProfiling,
  ({ req }) => {
    const url = new URL(req.url, "http://localhost");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || DEFAULT_LIMIT) : DEFAULT_LIMIT;

    const allRecords = readContentionRecords();

    // Sort by startedAt ascending, then take last N
    allRecords.sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
    const records = allRecords.slice(-limit);

    if (records.length === 0) {
      return { spans: [], totalMs: 0, phases: [] };
    }

    // Origin = earliest lockRequestedAt in the window
    const originMs = Math.min(
      ...records.map((r) => new Date(r.lockRequestedAt).getTime()),
    );

    const spans: Span[] = [];
    const phases: Phase[] = [];

    for (const record of records) {
      const pushOffset =
        new Date(record.lockRequestedAt).getTime() - originMs;

      phases.push({
        id: record.pushId,
        label: record.branch,
        outcome: record.outcome,
        branch: record.branch,
      });

      // "wait" span if there was lock contention
      if (record.waitMs > 0) {
        spans.push({
          id: `${record.pushId}:wait`,
          phase: record.pushId,
          label: "lock wait",
          startMs: pushOffset,
          durationMs: record.waitMs,
        });
      }

      // Step spans offset after the wait
      for (const step of record.steps) {
        spans.push({
          id: `${record.pushId}:${step.name}`,
          phase: record.pushId,
          label: step.name,
          startMs: pushOffset + record.waitMs + step.startMs,
          durationMs: step.durationMs,
        });
      }
    }

    // totalMs = max extent across all records
    const totalMs = Math.max(
      ...records.map((r) => {
        const pushOffset =
          new Date(r.lockRequestedAt).getTime() - originMs;
        return pushOffset + r.waitMs + r.holdMs;
      }),
    );

    return { spans, totalMs, phases };
  },
);
