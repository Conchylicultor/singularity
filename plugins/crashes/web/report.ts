import type { CrashReport } from "../shared/types";

export interface CrashReportResult {
  taskId: string | null;
  wasNew: boolean;
  crashLoop: boolean;
}

// Shape of the `context` value the crashes plugin's boundary reporter
// returns. Action contributors (e.g. launch-fix) cast `context: unknown`
// down to this type to read the recorded crash's taskId.
export interface CrashContext {
  taskId: string | null;
}

// POST to /api/crashes. Never throws: we're in an error path already.
// `keepalive: true` lets the request survive page unload. Returns null if the
// request fails or was discarded by `keepalive` during unload.
export async function report(body: CrashReport): Promise<CrashReportResult | null> {
  try {
    const r = await fetch("/api/crashes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!r.ok) return null;
    return (await r.json()) as CrashReportResult;
  } catch {
    return null;
  }
}
