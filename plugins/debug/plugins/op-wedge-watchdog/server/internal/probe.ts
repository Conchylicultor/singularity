// JS-level interrogation of an ARMED wedge (marker carries a pre-armed
// `bun --inspect` ws URL), run AFTER the native capture and BEFORE the reap.
//
// The heavy lifting happens in a spawned `scripts/js-interrogate.ts` child, not
// in-process: the probe holds a WebSocket to a pathological process for 60+s
// and a hung ws or flooded payload must be killable with one SIGKILL on a
// deadline — exactly what `runBounded` (capture.ts) already provides — rather
// than sitting in the main backend's event loop. The script prints ONE JSON
// document (its `JsInterrogation` shape) on stdout, including on partial
// failure, so a non-zero exit with parseable stdout is still evidence.
//
// This module also takes the SECOND lsof reading (the first is captureOpWedge's,
// at trip time; this one lands after the ~60s probe window) — the
// "does the socket vanish while the burn continues?" question from
// research/2026-07-22-global-cli-op-wedge-named-function.md.

import { join } from "node:path";
import type { FileSink } from "@plugins/infra/plugins/file-sink/core";
import { runBounded } from "./capture";

// Wire shape of scripts/js-interrogate.ts stdout (kept structurally in sync by
// the co-located probe.test.ts, which runs the real script end-to-end).
export interface JsInterrogation {
  wsUrl: string;
  seconds: number;
  traceCount: number | null;
  topStacks: Array<{ stack: string; count: number }>;
  rawTraces: string[][];
  heap: { t0: Record<string, number>; t1: Record<string, number>; wallMs: number } | null;
  protectedHistogram: { total: number; byKind: Record<string, number> } | null;
  failures: Array<{ step: string; error: string }>;
}

/** Compact summary that lands in the report payload (the raw JSON goes to the dump sink). */
export interface JsProbeSummary {
  armed: boolean;
  wsUrl: string | null;
  traceCount: number | null;
  topStacks: Array<{ stack: string; count: number }>;
  heapDelta: { wallMs: number; heapBytes: number; objects: number } | null;
  failures: Array<{ step: string; error: string }>;
}

export interface JsProbeRequest {
  pid: number;
  worktree: string;
  op: string;
  /** Marker's `inspect` field — `localhost:<port>/<token>`, or null when unarmed. */
  inspect: string | null;
  probeSeconds: number;
  /** The op-wedge capture sink the raw artifacts are appended to. */
  sink: FileSink;
}

const MAX_SECTION_BYTES = 512 * 1024;
function clamp(text: string): string {
  if (text.length <= MAX_SECTION_BYTES) return text;
  return `${text.slice(0, MAX_SECTION_BYTES)}\n… [truncated at ${MAX_SECTION_BYTES} bytes]`;
}

/**
 * Interrogate one armed wedge. Never throws: an unarmed marker returns an
 * explicit `armed: false` summary (absence of a probe must never read as an
 * empty probe), and every failure lands in `failures`.
 */
export async function probeWedgeJs(req: JsProbeRequest): Promise<JsProbeSummary> {
  if (req.inspect === null) {
    return {
      armed: false,
      wsUrl: null,
      traceCount: null,
      topStacks: [],
      heapDelta: null,
      failures: [
        {
          step: "armed",
          error:
            "op marker has no `inspect` ws URL — the op predates the pre-armed inspector " +
            "(worktree branched before 12efa0e37) or arming was disabled; JS interrogation impossible",
        },
      ],
    };
  }

  const wsUrl = `ws://${req.inspect}`;
  const script = join(import.meta.dir, "..", "..", "scripts", "js-interrogate.ts");
  const res = await runBounded(
    [process.execPath, script, wsUrl, "--seconds", String(req.probeSeconds)],
    (req.probeSeconds + 60) * 1000,
  );

  // The script ALWAYS exits 0 and conveys per-step failures inside its JSON
  // (a non-zero exit would make runBounded discard the partial stdout). So an
  // { ok: false } here means the spawn itself failed or timed out.
  let interrogation: JsInterrogation | null = null;
  const stdout = res.ok ? res.stdout : "";
  const failures: Array<{ step: string; error: string }> = [];
  if (!res.ok) {
    failures.push({ step: "js-interrogate", error: res.error });
  } else {
    try {
      interrogation = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as JsInterrogation;
      failures.push(...interrogation.failures);
    } catch (err) {
      failures.push({ step: "parse", error: `unparseable js-interrogate stdout: ${String(err)}` });
    }
  }

  // Second lsof — paired with captureOpWedge's trip-time one in the dump.
  const lsofBin = Bun.which("lsof") ?? "lsof";
  const lsofRes = await runBounded([lsofBin, "-p", String(req.pid)], 30_000);
  if (!lsofRes.ok) failures.push({ step: "lsof-after-probe", error: lsofRes.error });

  const sections = [
    "".padEnd(78, "="),
    `OP WEDGE JS INTERROGATION  ${new Date().toISOString()}`,
    `worktree=${req.worktree} op=${req.op} pid=${req.pid} ws=${wsUrl} seconds=${req.probeSeconds}`,
    failures.length === 0
      ? "failures: none — this interrogation is COMPLETE"
      : `failures: ${failures.length} — PARTIAL:\n${failures.map((f) => `  - ${f.step}: ${f.error}`).join("\n")}`,
    "".padEnd(78, "="),
    "",
    "--- [J1] js-interrogate.ts output (traces summary, heap delta, protected histogram) ---",
    interrogation !== null ? clamp(JSON.stringify(interrogation, null, 1)) : "(unavailable — see failures)",
    "",
    `--- [J2] lsof after the ${req.probeSeconds}s probe window (compare with the trip-time lsof above) ---`,
    lsofRes.ok ? clamp(lsofRes.stdout) : "(unavailable — see failures)",
    "",
  ].join("\n");
  try {
    req.sink.append(sections);
  } catch (err) {
    failures.push({ step: "dump-write", error: String(err) });
  }

  let heapDelta: JsProbeSummary["heapDelta"] = null;
  if (interrogation?.heap != null) {
    const { t0, t1, wallMs } = interrogation.heap;
    heapDelta = {
      wallMs,
      heapBytes: (t1.heapSize ?? 0) - (t0.heapSize ?? 0),
      objects: (t1.objectCount ?? 0) - (t0.objectCount ?? 0),
    };
  }
  return {
    armed: true,
    wsUrl,
    traceCount: interrogation?.traceCount ?? null,
    topStacks: interrogation?.topStacks ?? [],
    heapDelta,
    failures,
  };
}
