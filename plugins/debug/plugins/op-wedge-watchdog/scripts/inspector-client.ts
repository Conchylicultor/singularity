#!/usr/bin/env bun
/**
 * inspector-client.ts — pull a sampling CPU profile / JS stack from a live bun
 * process started with `--inspect=localhost:<port>/<token>` (CLI ops launch
 * pre-armed — see cli/bin/inspect.ts; the op marker's `inspect` field carries
 * the URL).
 *
 * Bun speaks the WebKit/JSC Inspector protocol (JSON-RPC over WebSocket).
 * Usage:
 *   bun inspector-client.ts ws://localhost:PORT/TOKEN profile <seconds> <out.json>
 *   bun inspector-client.ts ws://localhost:PORT/TOKEN pause  <n-stacks> <out.json>
 *   bun inspector-client.ts ws://localhost:PORT/TOKEN eval   '<expr>'
 *
 * Verified on bun 1.3.13 (2026-07-21, wedge investigation):
 *  - `profile` works mid-run on a busy process (ScriptProfiler samples on a
 *    dedicated thread) — this is THE capture mode for a wedged op.
 *  - `pause` is dead on 1.3.13 (Debugger.paused never delivers) — kept for
 *    future bun versions; it fails loudly with a timeout today.
 *  - Inspector commands dispatch on the JS thread: a never-yielding hot loop is
 *    uninspectable, but real wedges service timers (punctual heartbeats), so
 *    they ARE capturable.
 */

// Top-level await needs module scope; this script imports only globals.
export {};

interface RpcMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

interface JscFrame {
  name?: string;
  url?: string;
  line?: number;
}

interface JscStackTrace {
  stackFrames?: JscFrame[];
  frames?: JscFrame[];
}

interface ProfilePayload {
  samples?: { stackTraces?: JscStackTrace[] };
}

const [url, mode = "profile", arg1, outPath] = process.argv.slice(2);
if (url === undefined) {
  console.error("usage: inspector-client.ts <ws-url> profile|pause|eval ...");
  process.exit(2);
}

let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const events: { method: string; params: unknown }[] = [];
const eventWaiters: { method: string; resolve: (p: unknown) => void }[] = [];

const ws = new WebSocket(url);
const opened = new Promise<void>((resolve, reject) => {
  ws.onopen = () => resolve();
  ws.onerror = () => reject(new Error(`ws error connecting to ${url}`));
});
ws.onmessage = (msg) => {
  const data = JSON.parse(String(msg.data)) as RpcMessage;
  if (data.id !== undefined && pending.has(data.id)) {
    const p = pending.get(data.id)!;
    pending.delete(data.id);
    if (data.error) p.reject(new Error(data.error.message ?? "inspector rpc error"));
    else p.resolve(data.result);
  } else if (data.method !== undefined) {
    events.push({ method: data.method, params: data.params });
    for (let i = eventWaiters.length - 1; i >= 0; i--) {
      const waiter = eventWaiters[i];
      if (waiter !== undefined && waiter.method === data.method) {
        waiter.resolve(data.params);
        eventWaiters.splice(i, 1);
      }
    }
  }
};

function send(method: string, params: object = {}, timeoutMs = 20000): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`TIMEOUT ${timeoutMs}ms waiting for response to ${method} (id ${id})`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(t);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(t);
        reject(e);
      },
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// Fire a command whose RESPONSE we don't need (its payload arrives as an event,
// or it has none worth waiting on). No pending entry ⇒ no promise ⇒ nothing to
// time out or swallow — the follow-up `waitEvent` is where failure surfaces.
function notify(method: string, params: object = {}): void {
  ws.send(JSON.stringify({ id: nextId++, method, params }));
}

function waitEvent(method: string, timeoutMs = 30000): Promise<unknown> {
  const existing = events.find((e) => e.method === method);
  if (existing !== undefined) return Promise.resolve(existing.params);
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`TIMEOUT waiting for event ${method}`)),
      timeoutMs,
    );
    eventWaiters.push({
      method,
      resolve: (p) => {
        clearTimeout(t);
        resolve(p);
      },
    });
  });
}

await opened;
console.error(`[client] connected to ${url}`);

if (mode === "eval") {
  const r = await send("Runtime.evaluate", { expression: arg1 ?? "1+1", returnByValue: true }, 10000);
  console.log(JSON.stringify(r, null, 2));
} else if (mode === "profile") {
  const seconds = Number(arg1 ?? "10");
  // ScriptProfiler is the JSC sampling profiler; samples are taken by a
  // dedicated thread, so it works even while the main thread is busy.
  await send("ScriptProfiler.startTracking", { includeSamples: true }, 120000);
  console.error(`[client] profiling for ${seconds}s...`);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  // The samples payload arrives as the trackingComplete EVENT; the stopTracking
  // response itself is trivial and sometimes never delivered — don't wait on it.
  notify("ScriptProfiler.stopTracking");
  const complete = (await waitEvent("ScriptProfiler.trackingComplete", 240000)) as ProfilePayload;
  const out = outPath ?? "profile.json";
  await Bun.write(out, JSON.stringify(complete, null, 1));
  console.error(`[client] wrote ${out}`);
  summarize(complete);
} else if (mode === "pause") {
  const n = Math.max(1, Number(arg1 ?? "3"));
  notify("Debugger.enable");
  // Collect scriptParsed events for scriptId → url resolution.
  await new Promise((r) => setTimeout(r, 1500));
  const scriptUrls = new Map<string, string>();
  for (const e of events) {
    if (e.method !== "Debugger.scriptParsed") continue;
    const p = e.params as { scriptId?: string; url?: string };
    if (p.scriptId !== undefined) scriptUrls.set(p.scriptId, p.url ?? "");
  }
  const stacks: { fn: string; url: string; line: number }[][] = [];
  for (let i = 0; i < n; i++) {
    notify("Debugger.pause");
    // Dead on bun 1.3.13 (paused never delivers) — this throws loudly rather
    // than pretending; kept for future bun versions.
    const paused = (await waitEvent("Debugger.paused", 20000)) as {
      callFrames?: { functionName?: string; location?: { scriptId?: string; lineNumber?: number } }[];
    };
    const idx = events.findIndex((e) => e.method === "Debugger.paused");
    if (idx >= 0) events.splice(idx, 1);
    const frames = (paused.callFrames ?? []).map((f) => ({
      fn: f.functionName !== undefined && f.functionName !== "" ? f.functionName : "(anonymous)",
      url:
        (f.location?.scriptId !== undefined ? scriptUrls.get(f.location.scriptId) : undefined) ??
        f.location?.scriptId ??
        "?",
      line: (f.location?.lineNumber ?? -1) + 1,
    }));
    stacks.push(frames);
    console.error(`[client] stack ${i + 1}/${n}: ${frames.slice(0, 6).map((f) => f.fn).join(" < ")}`);
    await send("Debugger.resume", {}, 15000);
    await new Promise((r) => setTimeout(r, 700));
  }
  const out = outPath ?? "stacks.json";
  await Bun.write(out, JSON.stringify(stacks, null, 1));
  console.error(`[client] wrote ${out}`);
  for (const [i, s] of stacks.entries()) {
    console.log(`--- stack ${i + 1} ---`);
    for (const f of s.slice(0, 25)) console.log(`  ${f.fn}  (${f.url}:${f.line})`);
  }
} else {
  console.error(`unknown mode ${mode}`);
  process.exit(2);
}

ws.close();
process.exit(0);

// ── summarize a JSC ScriptProfiler samples payload ───────────────────────────
function summarize(complete: ProfilePayload): void {
  const traces = complete.samples?.stackTraces ?? [];
  console.error(`[client] ${traces.length} samples`);
  const frameKey = (f: JscFrame): string =>
    `${f.name !== undefined && f.name !== "" ? f.name : "(anonymous)"}  (${f.url ?? "?"}:${f.line ?? 0})`;
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  for (const t of traces) {
    const frames = t.stackFrames ?? t.frames ?? [];
    // stackFrames[0] is the leaf in JSC samples.
    const leaf = frames[0];
    if (leaf === undefined) continue;
    self.set(frameKey(leaf), (self.get(frameKey(leaf)) ?? 0) + 1);
    const seen = new Set<string>();
    for (const f of frames) {
      const k = frameKey(f);
      if (seen.has(k)) continue;
      seen.add(k);
      total.set(k, (total.get(k) ?? 0) + 1);
    }
  }
  const nTr = traces.length > 0 ? traces.length : 1;
  const top = (m: Map<string, number>): [string, number][] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`\n== top by SELF samples (${nTr} total) ==`);
  for (const [k, v] of top(self)) console.log(`  ${((v / nTr) * 100).toFixed(1).padStart(5)}%  ${v}  ${k}`);
  console.log(`\n== top by TOTAL (on-stack) samples ==`);
  for (const [k, v] of top(total)) console.log(`  ${((v / nTr) * 100).toFixed(1).padStart(5)}%  ${v}  ${k}`);
}
