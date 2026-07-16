/**
 * Shared test-support for the resource-runtime `bun:test` suites. Plain `.ts`
 * (NOT `.test.ts`) so `bun test` never collects it as a suite, and it imports no
 * `bun:test`. Extracts the harness/controllable/tick helpers that were duplicated
 * inside `runtime.test.ts` and adds the two capabilities the invariant suites
 * (`runtime-h5`, `runtime-scoped-routing`, `runtime-catchup`) need on top:
 *
 *   - `createHarness(opts?)` — `createResourceRuntime(opts)` wrapped with N fake
 *     sockets that record the FULL parsed frame (value / upserts / deletes /
 *     order / etag), not just `{seq,key,kind,version}`. Subsumes the old
 *     `harness()` + `feedHarness()` (a `readSet` option folds them into one) and
 *     the reval-only `revalHarness()` (subscribe takes an `etag`).
 *   - `makeClientView(keyOf?)` — a faithful client simulator that applies frames
 *     through the REAL WS version guard + keyed-delta merge, so a test can assert
 *     "the client converges to server truth" instead of eyeballing frame shapes.
 *   - `rng(seed)` — the mulberry32 PRNG (deduped from `keyed-diff.test.ts`).
 *
 * The client-side semantics mirrored here are load-bearing; see the cross-ref
 * comments on each (`notifications-client.ts` version guard, `keyed-delta-merge.ts`
 * merge). They are RE-implemented, never imported — resource-runtime must stay
 * acyclic and cannot depend on the live-state primitive.
 */

import {
  createResourceRuntime,
  type ResourceParams,
  type ResourceRuntimeOptions,
} from "./runtime";

// Next-macrotask yield: flushes all pending microtasks (the queued flush) AND any
// loader promises so the WS sends have landed in the log before we assert.
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * A fully-parsed WS frame as recorded off a fake socket. `seq` is a monotonic
 * send-order counter shared across all sockets of one harness; `socket` is the
 * index of the socket it was sent to. Every other field is spread verbatim from
 * the parsed frame, so *presence* is faithful (`"etag" in frame` is true iff the
 * server actually attached one) — the reval tests depend on that.
 */
export interface RecordedFrame {
  seq: number;
  socket: number;
  kind: string;
  key?: string;
  id?: number;
  version?: number;
  value?: unknown;
  upserts?: [string, unknown][];
  deletes?: string[];
  order?: string[];
  etag?: string;
  /** Flight-co-produced commit watermark (Rule B′): full frames only. */
  watermark?: string;
  reason?: string;
  params?: ResourceParams;
  /** Boot epoch stamped on sub-ack / up-to-date / up-to-date-batch frames. */
  epoch?: string;
  /** `up-to-date-batch` entries. */
  entries?: Array<{ id?: number; key: string; params: ResourceParams; version: number }>;
}

export interface Harness {
  runtime: ReturnType<typeof createResourceRuntime>;
  /** Every non-ping frame sent to any socket, in global send order. */
  frames: RecordedFrame[];
  /** Frames sent to one socket. */
  framesFor: (socketIdx: number) => RecordedFrame[];
  /** Send `op:sub` on a socket and await the next macrotask (sub-ack lands). */
  subscribe: (
    key: string,
    params?: ResourceParams,
    o?: { socket?: number; etag?: string; version?: number; epoch?: string; tabId?: string },
  ) => Promise<void>;
  /** Send `op:sub-batch` (one tab's whole-set replay) and await the next macrotask. */
  subscribeBatch: (
    entries: Array<{ key: string; params?: ResourceParams; etag?: string; version?: number }>,
    o?: { socket?: number; tabId?: string; epoch?: string; complete?: boolean },
  ) => Promise<void>;
  /** Send `op:unsub` on a socket and await the next macrotask. */
  unsub: (
    key: string,
    params?: ResourceParams,
    o?: { socket?: number; tabId?: string },
  ) => Promise<void>;
  /** Send `op:unsub-tab` (best-effort tab departure) and await the next macrotask. */
  unsubTab: (tabId: string, o?: { socket?: number }) => Promise<void>;
  /** Close a socket (runs the runtime's close handler, releasing its subs). */
  closeSocket: (socketIdx?: number) => void;
  /** Frames for `key`, excluding the initial sub-ack. Optionally scoped to one socket. */
  pushesFor: (key: string, socketIdx?: number) => RecordedFrame[];
  tick: typeof tick;
}

/**
 * A runtime under test plus `sockets` (default 1) fake `ServerWebSocket`s opened
 * via `notificationsWsHandler.open`. Records every frame each socket receives.
 * `opts` are the runtime's own `ResourceRuntimeOptions` (so a test injects
 * `readSet`, `shouldPersist`, `captureWatermark`, `persistSnapshot`, `onPush`, …)
 * plus the harness-only `sockets` count.
 */
export function createHarness(
  opts: ResourceRuntimeOptions & { sockets?: number } = {},
): Harness {
  const { sockets: socketCount = 1, ...runtimeOpts } = opts;
  const runtime = createResourceRuntime(runtimeOpts);
  const frames: RecordedFrame[] = [];
  let seq = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = runtime.notificationsWsHandler as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsList: any[] = [];
  for (let i = 0; i < socketCount; i++) {
    const socketIdx = i;
    // Fake ServerWebSocket: only `send` is exercised by the runtime's sendJson.
    const ws = {
      send(raw: string) {
        const msg = JSON.parse(raw) as Record<string, unknown> & { kind: string };
        if (msg.kind === "ping") return; // ignore heartbeats
        // Spread verbatim so key presence (etag/value) is faithful for the reval
        // assertions; only seq/socket are synthesized.
        frames.push({ seq: seq++, socket: socketIdx, ...msg } as RecordedFrame);
      },
    };
    handler.open(ws);
    wsList.push(ws);
  }

  return {
    runtime,
    frames,
    framesFor: (socketIdx: number) => frames.filter((f) => f.socket === socketIdx),
    async subscribe(key, params = {}, o = {}) {
      const ws = wsList[o.socket ?? 0];
      handler.message(
        ws,
        JSON.stringify({
          op: "sub",
          key,
          params,
          ...(o.etag !== undefined ? { etag: o.etag } : {}),
          ...(o.version !== undefined ? { version: o.version } : {}),
          ...(o.epoch !== undefined ? { epoch: o.epoch } : {}),
          ...(o.tabId !== undefined ? { tabId: o.tabId } : {}),
        }),
      );
      await tick(); // let the async sub-ack (initial load) complete
    },
    async subscribeBatch(entries, o = {}) {
      const ws = wsList[o.socket ?? 0];
      handler.message(
        ws,
        JSON.stringify({
          op: "sub-batch",
          tabId: o.tabId ?? "tab-test",
          ...(o.epoch !== undefined ? { epoch: o.epoch } : {}),
          complete: o.complete ?? true,
          entries: entries.map((e, i) => ({
            id: i + 1,
            key: e.key,
            params: e.params ?? {},
            ...(e.etag !== undefined ? { etag: e.etag } : {}),
            ...(e.version !== undefined ? { version: e.version } : {}),
          })),
        }),
      );
      await tick(); // let detached full-path serves complete
    },
    async unsub(key, params = {}, o = {}) {
      const ws = wsList[o.socket ?? 0];
      handler.message(
        ws,
        JSON.stringify({
          op: "unsub",
          key,
          params,
          ...(o.tabId !== undefined ? { tabId: o.tabId } : {}),
        }),
      );
      await tick();
    },
    async unsubTab(tabId, o = {}) {
      const ws = wsList[o.socket ?? 0];
      handler.message(ws, JSON.stringify({ op: "unsub-tab", tabId }));
      await tick();
    },
    closeSocket(socketIdx = 0) {
      handler.close(wsList[socketIdx], 1000, "test");
    },
    pushesFor(key, socketIdx) {
      return frames.filter(
        (f) =>
          f.key === key &&
          f.kind !== "sub-ack" &&
          (socketIdx === undefined || f.socket === socketIdx),
      );
    },
    tick,
  };
}

/**
 * A loader whose completion the test controls. Initially open (so the sub-ack's
 * initial load resolves immediately); call `block()` to make the NEXT load park
 * until `release()`.
 */
export function controllable<T>(initial: T) {
  let releaseFn: (() => void) | undefined;
  let blocker: Promise<void> = Promise.resolve();
  let value = initial;
  return {
    /** The current value the loader would return (for scoped-load test loaders). */
    get value(): T {
      return value;
    },
    loader: async (): Promise<T> => {
      await blocker;
      return value;
    },
    block() {
      blocker = new Promise<void>((res) => {
        releaseFn = res;
      });
    },
    release() {
      releaseFn?.();
    },
    setValue(v: T) {
      value = v;
    },
  };
}

// --- Client simulator -------------------------------------------------------

// Default row identity for keyed payloads (matches the tests' `{ id }` rows).
const defaultKeyOf = (row: unknown): string => (row as { id: string }).id;

/**
 * Faithful local mirror of `mergeKeyedDelta` in
 * `@plugins/primitives/plugins/live-state/web/keyed-delta-merge.ts`. Re-implemented
 * (not imported) because resource-runtime must stay acyclic and cannot depend on
 * the live-state primitive. Keep byte-behavior-identical with the source:
 *   - `order === undefined` ⇒ in-place upserts only (no add/delete/reorder, no drift).
 *   - `order` present ⇒ rebuild from the authoritative id list, reusing prior row
 *     references for ids the server didn't resend; any `order` id resolvable from
 *     neither `upsertMap` nor the cached base ⇒ `{ kind: "drift" }`.
 */
function mergeKeyedDeltaLocal(
  prevRows: readonly unknown[],
  upsertMap: ReadonlyMap<string, unknown>,
  order: readonly string[] | undefined,
  keyOf: (row: unknown) => string,
):
  | { kind: "merged"; rows: readonly unknown[] }
  | { kind: "drift"; missingIds: readonly string[] } {
  if (order === undefined) {
    return {
      kind: "merged",
      rows: prevRows.map((row) => upsertMap.get(keyOf(row)) ?? row),
    };
  }
  const existingById = new Map<string, unknown>();
  for (const row of prevRows) existingById.set(keyOf(row), row);
  const rows: unknown[] = [];
  const missingIds: string[] = [];
  for (const rowId of order) {
    const row = upsertMap.get(rowId) ?? existingById.get(rowId);
    if (row === undefined) {
      missingIds.push(rowId);
      continue;
    }
    rows.push(row);
  }
  if (missingIds.length > 0) return { kind: "drift", missingIds };
  return { kind: "merged", rows };
}

/**
 * A faithful single-subscription client simulator for one `(key, params)`. Applies
 * frames through the REAL WS version guard + keyed-delta merge so a test can assert
 * "the client converged to server truth", not just a frame shape.
 *
 * Version guard mirrors `notifications-client.ts` `handleServerMessage` (~L862):
 * APPLY a frame iff `frame.version > version`. Baseline is `-1` ("nothing applied
 * yet"), so the very first frame (a sub-ack reporting version 0) is accepted.
 */
export interface ClientView {
  readonly value: unknown;
  readonly version: number;
  /**
   * The boot epoch `version` belongs to — stamped from the last epoch-carrying WS
   * frame (`sub-ack`/`up-to-date`) that adopted a version. `undefined` until the
   * first such frame. Labels `version` so a cross-boot HTTP body isn't mis-compared.
   */
  readonly epoch: string | undefined;
  /** How many deltas arrived with no resolvable base (the real client resubs). */
  readonly driftResubs: number;
  /** Set by an `invalidate` frame; a test converges it via `applyHttpRefetch`. */
  readonly stale: boolean;
  apply(frame: RecordedFrame): void;
  applyAll(frames: readonly RecordedFrame[]): void;
  /**
   * Adopt a refetch (HTTP GET) result — the invalidate-mode convergence path.
   * Hand-mirrors `fetchOverHttp`'s epoch-aware guard (Fix B). An epoch-less body
   * (pre-upgrade server) keeps today's strict-`<` behavior; when the body carries
   * an `epoch` and the view holds an entry epoch, the guard matrix applies:
   *   1. same boot (`body.epoch === entry.epoch`) → strict-`<` (equal-version accept);
   *   2. entry stale-boot (`body.epoch === serverEpoch`) → ADOPT unconditionally;
   *   3. body stale-boot (`entry.epoch === serverEpoch`) → DROP;
   *   4. no arbiter (neither matches serverEpoch) → ADOPT (WS-down fallback window).
   * The view's "known server epoch" mirrors the WS channel's current identity: the
   * last epoch seen on any `sub-ack`/`up-to-date` frame.
   */
  applyHttpRefetch(res: { value: unknown; version: number; epoch?: string }): void;
}

export function makeClientView(keyOf: (row: unknown) => string = defaultKeyOf): ClientView {
  let version = -1;
  let value: unknown = undefined;
  let driftResubs = 0;
  let stale = false;
  // The boot `version` belongs to. Stamped from epoch-carrying WS frames only
  // (`sub-ack`/`up-to-date`); `update`/`delta`/`invalidate` leave it unchanged.
  let entryEpoch: string | undefined = undefined;
  // The WS channel's current server identity — the last epoch seen on any frame.
  let serverEpoch: string | undefined = undefined;

  return {
    get value() {
      return value;
    },
    get version() {
      return version;
    },
    get epoch() {
      return entryEpoch;
    },
    get driftResubs() {
      return driftResubs;
    },
    get stale() {
      return stale;
    },
    apply(frame: RecordedFrame): void {
      // Any epoch-carrying frame refreshes the channel's known server identity,
      // even if its version fails the guard below (an old-boot replay still tells
      // us which boot the socket is now talking to).
      if (frame.epoch !== undefined) serverEpoch = frame.epoch;
      if (frame.version === undefined) return; // sub-error / ping — no version
      // WS version guard: drop anything not strictly newer than what we hold.
      if (frame.version <= version) return;
      if (frame.kind === "sub-ack" || frame.kind === "update") {
        version = frame.version;
        value = frame.value;
        // `update` carries no epoch → leaves `entryEpoch` unchanged; `sub-ack` does.
        if (frame.epoch !== undefined) entryEpoch = frame.epoch;
        return;
      }
      if (frame.kind === "up-to-date") {
        // Conditional-revalidation hit: adopt the version, keep the cached value.
        version = frame.version;
        if (frame.epoch !== undefined) entryEpoch = frame.epoch;
        return;
      }
      if (frame.kind === "invalidate") {
        // The real client adopts the version (guard) then refetches over HTTP.
        version = frame.version;
        stale = true;
        return;
      }
      if (frame.kind === "delta") {
        const upsertMap = new Map<string, unknown>();
        for (const [id, row] of frame.upserts ?? []) upsertMap.set(id, row);
        const prevRows = Array.isArray(value) ? (value as unknown[]) : [];
        const result = mergeKeyedDeltaLocal(prevRows, upsertMap, frame.order, keyOf);
        if (result.kind === "drift") {
          // Base drift: the real client discards the delta and resubs for a fresh
          // full base. We record it and leave value/version UNCHANGED, so drift is
          // a detectable non-converged state until a later full frame arrives.
          driftResubs++;
          return;
        }
        version = frame.version;
        value = result.rows;
        return;
      }
    },
    applyAll(fs: readonly RecordedFrame[]): void {
      for (const f of fs) this.apply(f);
    },
    applyHttpRefetch(res: { value: unknown; version: number; epoch?: string }): void {
      const bodyEpoch = res.epoch;
      const adopt = (): void => {
        // Cross-epoch adopt: `version` is NOT monotonic here — an old-boot number is
        // meaningless against a new-boot body — so we take the body's version wholesale.
        version = res.version;
        value = res.value;
        if (bodyEpoch !== undefined) entryEpoch = bodyEpoch;
        stale = false;
      };
      // Epoch-less body (pre-upgrade server) or no known entry epoch → today's
      // behavior byte-for-byte: strict-`<` guard on version.
      if (bodyEpoch === undefined || entryEpoch === undefined) {
        if (res.version < version) return; // strict-< HTTP guard
        version = res.version;
        value = res.value;
        if (bodyEpoch !== undefined) entryEpoch = bodyEpoch;
        stale = false;
        return;
      }
      // Case 1 — same boot: keep strict-`<` (preserves the equal-version accept).
      if (bodyEpoch === entryEpoch) {
        if (res.version < version) return;
        version = res.version;
        value = res.value;
        stale = false;
        return;
      }
      // Epochs differ.
      // Case 2 — entry is stale-boot, body is the WS's current server identity: ADOPT.
      if (bodyEpoch === serverEpoch) return adopt();
      // Case 3 — body is stale-boot, entry is the current server identity: DROP.
      if (entryEpoch === serverEpoch) return;
      // Case 4 — no arbiter (serverEpoch matches neither / undefined): ADOPT.
      adopt();
    },
  };
}

/**
 * Deterministic PRNG (mulberry32) so a fuzz failure is reproducible from its
 * seed — `Math.random()` would make a red run impossible to replay. Single-sourced
 * here and imported by `keyed-diff.test.ts`.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
