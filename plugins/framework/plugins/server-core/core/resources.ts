import type { ServerWebSocket } from "bun";
import type { ZodType } from "zod";
import { recordEntrySpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { defineServerContribution } from "./contributions";
import { reportServerError } from "./error-reporter";
import type { WsData, WsHandler } from "./types";

export const Resource = {
  Declare: defineServerContribution<{ key: string; mode: ResourceMode }>(
    "resource.declare",
  ),
};

// Live-state primitive. See
// research/2026-04-15-global-sse-lifecycle-mental-model-v3.md
//
// A plugin calls defineResource({key, loader, mode?}). The server exposes:
//   GET /api/resources/:key                      — HTTP fallback
//   WS  /ws/notifications                        — single push channel
// and broadcasts updates when the plugin calls resource.notify().

export type ResourceMode = "push" | "invalidate" | "keyed";
export type ResourceParams = Record<string, string>;

// Upstream edge: when `resource` notifies, this resource is cascaded.
// `map` translates upstream params (and optionally value) into the list of
// downstream params tuples to schedule. Default: identity (`[upstreamParams]`).
// See `research/2026-04-16-global-derived-state-primitive-v2.md`.
export interface DependsOnEntry<P extends ResourceParams = ResourceParams> {
  // biome-ignore lint/suspicious/noExplicitAny: upstream type is erased — the map callback owns the shape.
  resource: Resource<any, any>;
  map?: (
    // biome-ignore lint/suspicious/noExplicitAny: see above.
    upstreamParams: any,
    upstreamValue: unknown,
  ) => P[];
  /**
   * Scoped-recompute (Layer 2): translate the set of changed upstream row ids
   * into the set of changed downstream row ids, so the downstream loader can
   * recompute only the affected rows (`WHERE id IN (…)`) instead of the whole
   * view. Only consulted when the upstream notify carried `affectedIds`. If
   * absent (or it throws), the cascade degrades the downstream to a FULL
   * recompute — never silently drops a change. Must self-query the DB rather
   * than read the upstream value, so it does NOT force the upstream loader to
   * run. See research/2026-06-06-global-live-state-layer2-scoped-recompute-impl.md.
   */
  affectedMap?: (
    upstreamAffected: ReadonlySet<string>,
    // biome-ignore lint/suspicious/noExplicitAny: upstream params type is erased — see above.
    upstreamParams: any,
  ) => Promise<string[]> | string[];
}

export interface ResourceDefinition<T, P extends ResourceParams = ResourceParams> {
  key: string;
  mode?: ResourceMode;
  /**
   * Compute the resource value for `params`. When the notify that triggered
   * this load carried scoped `affectedIds` (Layer 2), `ctx.affectedIds` lists
   * the changed row ids and the loader MAY recompute only those rows (returning
   * a partial array for `keyed` mode — the diff merges it into the snapshot).
   * Full loads (sub-ack, HTTP fallback, plain `notify()`) pass `ctx === undefined`.
   */
  loader: (params: P, ctx?: { affectedIds: readonly string[] }) => Promise<T> | T;
  /**
   * Zod schema for the payload. Required. The server parses every loader output
   * against it at load time (single chokepoint in `timedLoad`) before any
   * broadcast — a payload that violates its schema fails loudly instead of
   * shipping. The descriptor exposed to clients carries the same schema so the
   * browser re-parses before the value lands in the TanStack cache. See
   * research/2026-06-08-global-mandatory-resource-schema-server-validation.md.
   */
  schema: ZodType<T>;
  /**
   * Row identity for `mode: "keyed"` resources. Required (and only meaningful)
   * when `mode === "keyed"`: the loader's `T` must be an array, and `keyOf`
   * extracts a stable id from each row. The server keeps a per-(key,params)
   * snapshot of id→hash and broadcasts only changed rows + the id order, so a
   * single-row change ships one row instead of the whole array. See
   * research/2026-06-05-global-live-state-delta-sync.md.
   */
  // biome-ignore lint/suspicious/noExplicitAny: row type is the element of the array payload — erased here.
  keyOf?: (row: any) => string;
  /**
   * Upstream resources. When any listed resource notifies, this resource is
   * scheduled to notify within the same microtask flush, with per-key /
   * per-params coalescing. Cycles are detected at boot (warn-only in phase 1).
   */
  dependsOn?: ReadonlyArray<DependsOnEntry<P>>;
  /**
   * Sub-lifecycle hooks. Fire on the 0→1 and N→0 global refcount transitions
   * for a given params tuple (counted across every open socket; a socket
   * closing releases the refs it held).
   */
  onFirstSubscribe?: (params: P) => void | Promise<void>;
  onLastUnsubscribe?: (params: P) => void;
}

export interface Resource<T, P extends ResourceParams = ResourceParams> {
  key: string;
  mode: ResourceMode;
  schema: ZodType<T>;
  load(params: P): Promise<T>;
  /**
   * Signal that state has changed. No-arg = parameterless resource.
   * `opts.affectedIds` (Layer 2) scopes the recompute to those row ids — the
   * loader receives them via `ctx.affectedIds` and may return only the changed
   * rows. Omit it for full-recompute semantics (the correct default for any
   * membership change: create/delete/reorder). Sticky FULL: any id-less
   * contributor to the same flush degrades the whole pk back to FULL.
   */
  notify(params?: P, opts?: { affectedIds?: string[] }): void;
}

interface DownstreamEdge {
  downstreamKey: string;
  map?: (upstreamParams: ResourceParams, upstreamValue: unknown) => ResourceParams[];
  affectedMap?: (
    upstreamAffected: ReadonlySet<string>,
    upstreamParams: ResourceParams,
  ) => Promise<string[]> | string[];
}

// A coalesced pending notify for one params-tuple. `affected === null` means
// FULL recompute (sticky/absorbing): once a flush has any id-less contributor
// the pk stays FULL. A non-null Set scopes the recompute to those row ids.
interface PendingNotify {
  params: ResourceParams;
  affected: Set<string> | null;
}

interface RegistryEntry {
  key: string;
  mode: ResourceMode;
  /** Payload schema. The loader output is parsed against it in `timedLoad`. */
  schema: ZodType<unknown>;
  loader: (
    params: ResourceParams,
    ctx?: { affectedIds: readonly string[] },
  ) => Promise<unknown> | unknown;
  /** Row identity for keyed mode. Undefined for push/invalidate entries. */
  keyOf?: (row: unknown) => string;
  /**
   * Per-pk snapshot of id→hash for keyed entries. Allocated lazily only when
   * `mode === "keyed"`. Lets the diff ship only changed rows. Evicted per-pk on
   * the N→0 sub transition so memory is bounded to actively-observed pks.
   */
  snapshots?: Map<string, Map<string, string>>;
  /** Monotonic version per params-tuple. */
  versions: Map<string, number>;
  /** Coalesced pending notifies per params-tuple. */
  pendingNotifies: Map<string, PendingNotify>;
  /** Global subscriber refcount per params-tuple (across all sockets). */
  subCounts: Map<string, number>;
  /** Upstream keys this entry listens to (for cycle detection). */
  upstreamKeys: string[];
  /** Downstream entries to cascade to when this entry notifies. */
  downstream: DownstreamEdge[];
  onFirstSubscribe?: (params: ResourceParams) => void | Promise<void>;
  onLastUnsubscribe?: (params: ResourceParams) => void;
}

const registry = new Map<string, RegistryEntry>();
let dagDirty = true;
let topoOrder: RegistryEntry[] = [];

// Time a resource loader call and record a `loader` span keyed by entry.key.
// recordEntrySpan also establishes the ambient parent context so DB queries
// issued inside the loader attribute to it. The loader output is parsed against
// the resource's schema before it leaves this function, so every load path
// (sub-ack, push/keyed/scoped notify, HTTP fallback) is validated at one
// chokepoint — a schema violation throws here and is handled by each caller's
// loader-failure path (report + skip the send). Keyed Layer-2 scoped loads
// return a partial array, which still satisfies the `z.array(Element)` schema.
function timedLoad(
  entry: RegistryEntry,
  params: ResourceParams,
  ctx?: { affectedIds: readonly string[] },
): Promise<unknown> {
  return recordEntrySpan("loader", entry.key, async () =>
    entry.schema.parse(await entry.loader(params, ctx)),
  );
}

// Coalesce an incoming notify into the pending map for one pk, applying the
// FULL-absorbing union: a null `incoming` (or an existing FULL) sticks the pk
// at FULL; otherwise the incoming ids union into the existing scoped set.
function mergePending(
  map: Map<string, PendingNotify>,
  pk: string,
  params: ResourceParams,
  incoming: Set<string> | null,
): void {
  const existing = map.get(pk);
  if (!existing) {
    map.set(pk, { params, affected: incoming === null ? null : new Set(incoming) });
    return;
  }
  if (existing.affected === null) return; // FULL absorbs everything
  if (incoming === null) {
    existing.affected = null; // degrade to FULL
    return;
  }
  for (const id of incoming) existing.affected.add(id);
}

function paramsKey(params: ResourceParams): string {
  const keys = Object.keys(params).sort();
  const obj: ResourceParams = {};
  for (const k of keys) obj[k] = params[k]!;
  return JSON.stringify(obj);
}

export function defineResource<T, P extends ResourceParams = ResourceParams>(
  def: ResourceDefinition<T, P>,
): Resource<T, P> {
  if (registry.has(def.key)) {
    throw new Error(`defineResource: duplicate key "${def.key}"`);
  }
  const mode = def.mode ?? "invalidate";
  if (!def.schema) {
    throw new Error(`defineResource: a schema is required for key "${def.key}"`);
  }
  if (mode === "keyed" && !def.keyOf) {
    throw new Error(
      `defineResource: mode "keyed" requires a keyOf for key "${def.key}"`,
    );
  }
  const upstreamKeys: string[] = [];
  const ownDownstreamEdges: Array<{ upstreamKey: string; edge: DownstreamEdge }> = [];
  for (const dep of def.dependsOn ?? []) {
    upstreamKeys.push(dep.resource.key);
    ownDownstreamEdges.push({
      upstreamKey: dep.resource.key,
      edge: {
        downstreamKey: def.key,
        map: dep.map as
          | ((
              upstreamParams: ResourceParams,
              upstreamValue: unknown,
            ) => ResourceParams[])
          | undefined,
        affectedMap: dep.affectedMap as
          | ((
              upstreamAffected: ReadonlySet<string>,
              upstreamParams: ResourceParams,
            ) => Promise<string[]> | string[])
          | undefined,
      },
    });
  }
  const entry: RegistryEntry = {
    key: def.key,
    mode,
    schema: def.schema as ZodType<unknown>,
    loader: def.loader as (
      params: ResourceParams,
      ctx?: { affectedIds: readonly string[] },
    ) => Promise<unknown> | unknown,
    keyOf: def.keyOf as ((row: unknown) => string) | undefined,
    snapshots: mode === "keyed" ? new Map() : undefined,
    versions: new Map(),
    pendingNotifies: new Map(),
    subCounts: new Map(),
    upstreamKeys,
    downstream: [],
    onFirstSubscribe: def.onFirstSubscribe as
      | ((params: ResourceParams) => void | Promise<void>)
      | undefined,
    onLastUnsubscribe: def.onLastUnsubscribe as
      | ((params: ResourceParams) => void)
      | undefined,
  };
  registry.set(def.key, entry);

  // Wire this entry as a downstream of its upstreams. Upstreams must be
  // defined before their downstreams — otherwise the upstream's registry
  // entry doesn't exist yet. Warned lazily during DAG rebuild.
  for (const { upstreamKey, edge } of ownDownstreamEdges) {
    const upstream = registry.get(upstreamKey);
    if (upstream) upstream.downstream.push(edge);
  }
  dagDirty = true;

  return {
    key: def.key,
    mode,
    schema: def.schema,
    async load(params: P): Promise<T> {
      // Parse here too: this handle method is the one load path that bypasses
      // `timedLoad`, so it must validate to keep the guarantee total.
      return def.schema.parse(await def.loader(params));
    },
    notify(params?: P, opts?: { affectedIds?: string[] }): void {
      const affected = opts?.affectedIds ? new Set(opts.affectedIds) : null;
      scheduleNotify(entry, (params ?? ({} as P)) as ResourceParams, affected);
    },
  };
}

// Rebuild the topological order and warn on cycles or dangling upstream refs.
// Called lazily — amortised to flushNotifies and the debug endpoint.
function rebuildDag(): void {
  if (!dagDirty) return;
  dagDirty = false;

  const order: RegistryEntry[] = [];
  const state = new Map<string, "visiting" | "done">();
  const cycles: string[][] = [];

  const visit = (entry: RegistryEntry, stack: string[]): void => {
    const s = state.get(entry.key);
    if (s === "done") return;
    if (s === "visiting") {
      const i = stack.indexOf(entry.key);
      cycles.push(stack.slice(i >= 0 ? i : 0).concat(entry.key));
      return;
    }
    state.set(entry.key, "visiting");
    stack.push(entry.key);
    for (const upKey of entry.upstreamKeys) {
      const up = registry.get(upKey);
      if (!up) {
        console.warn(
          `[resources] "${entry.key}" depends on unknown resource "${upKey}" (upstream not yet defined at ${entry.key}'s registration time?)`,
        );
        continue;
      }
      visit(up, stack);
    }
    stack.pop();
    state.set(entry.key, "done");
    order.push(entry);
  };

  for (const entry of registry.values()) visit(entry, []);

  if (cycles.length > 0) {
    for (const cycle of cycles) {
      // Phase 1: warn only. Phase 3 promotes this to a hard failure.
      console.warn(`[resources] dependsOn cycle detected: ${cycle.join(" -> ")}`);
    }
  }

  topoOrder = order;
}

// --- Broadcast machinery ---

interface SocketState {
  ws: ServerWebSocket<WsData>;
  /** key -> paramsKey -> params object (subscriptions this socket holds). */
  subs: Map<string, Map<string, ResourceParams>>;
}

const sockets = new Map<ServerWebSocket<WsData>, SocketState>();

function subscribersFor(key: string, pk: string): SocketState[] {
  const out: SocketState[] = [];
  for (const st of sockets.values()) {
    const inner = st.subs.get(key);
    if (inner?.has(pk)) out.push(st);
  }
  return out;
}

function sendJson(ws: ServerWebSocket<WsData>, obj: unknown): void {
  try {
    ws.send(JSON.stringify(obj));
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // close handler will clean up
  }
}

let flushScheduled = false;
let batchDepth = 0;

export async function withNotifyBatch<T>(fn: () => Promise<T>): Promise<T> {
  batchDepth++;
  try {
    return await fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && !flushScheduled) {
      for (const entry of registry.values()) {
        if (entry.pendingNotifies.size > 0) {
          flushScheduled = true;
          queueMicrotask(() => { void flushNotifies(); });
          break;
        }
      }
    }
  }
}

function scheduleNotify(
  entry: RegistryEntry,
  params: ResourceParams,
  affected: Set<string> | null,
): void {
  mergePending(entry.pendingNotifies, paramsKey(params), params, affected);
  if (batchDepth > 0) return;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => { void flushNotifies(); });
}

// Build the id→hash map for a keyed resource's array value. The hash is the
// row's canonical JSON string — a fast non-crypto identity over the full row
// (including nested arrays like an attempt's `conversations`). Shared by
// `diffKeyed` and `handleSub` so both sides compute identity identically.
function snapshotOf(entry: RegistryEntry, value: unknown): Map<string, string> {
  const keyOf = entry.keyOf;
  if (!keyOf) {
    throw new Error(`[resources] keyed resource "${entry.key}" missing keyOf`);
  }
  if (!Array.isArray(value)) {
    throw new Error(
      `[resources] keyed resource "${entry.key}" loader must return an array`,
    );
  }
  const map = new Map<string, string>();
  for (const row of value) map.set(keyOf(row), JSON.stringify(row));
  return map;
}

interface KeyedDiff {
  upserts: [string, unknown][];
  deletes: string[];
  /**
   * The full ordered id list, OR `undefined` when order/membership are
   * unchanged (the common in-place-update case: a status/title flip on one
   * row). The snapshot Map is built from `value` in order, so iterating the
   * prior snapshot's keys yields the prior order; when it matches the new order
   * element-for-element we omit it from the wire. An omitted `order` strictly
   * means "in-place upserts, membership/order unchanged" — `deletes` is then
   * necessarily empty and there are no brand-new ids.
   */
  order: string[] | undefined;
  hadSnapshot: boolean;
}

// Diff the new array `value` against the stored snapshot for `pk`, then REPLACE
// that snapshot with the freshly computed id→hash map. `hadSnapshot` is false
// only when there was no prior snapshot entry for `pk` (first notify) — callers
// send a full update in that case so brand-new clients get a complete base.
function diffKeyed(entry: RegistryEntry, pk: string, value: unknown): KeyedDiff {
  const keyOf = entry.keyOf;
  if (!keyOf) {
    throw new Error(`[resources] keyed resource "${entry.key}" missing keyOf`);
  }
  if (!Array.isArray(value)) {
    throw new Error(
      `[resources] keyed resource "${entry.key}" loader must return an array`,
    );
  }
  const snapshots = (entry.snapshots ??= new Map());
  const prev = snapshots.get(pk);
  const hadSnapshot = prev !== undefined;
  // Map preserves insertion order, and the snapshot was built from the prior
  // `value` in order, so its key iteration order is the prior id order.
  const prevOrder = prev ? [...prev.keys()] : undefined;
  const next = new Map<string, string>();
  const upserts: [string, unknown][] = [];
  const order: string[] = [];
  for (const row of value) {
    const id = keyOf(row);
    const hash = JSON.stringify(row);
    next.set(id, hash);
    order.push(id);
    if (!prev || prev.get(id) !== hash) upserts.push([id, row]);
  }
  const deletes: string[] = [];
  if (prev) {
    for (const id of prev.keys()) if (!next.has(id)) deletes.push(id);
  }
  snapshots.set(pk, next);
  // Omit `order` when the id sequence is identical to the prior one — a delete
  // or insert changes membership ⇒ length/sequence differs ⇒ order is sent.
  const orderUnchanged =
    prevOrder !== undefined &&
    prevOrder.length === order.length &&
    prevOrder.every((id, i) => id === order[i]);
  return { upserts, deletes, order: orderUnchanged ? undefined : order, hadSnapshot };
}

// Scoped diff (Layer 2): `scopedRows` is a PARTIAL array — only the recomputed
// affected rows. We MERGE them into the existing snapshot (never replace it):
// each changed row becomes an upsert and its hash is written back; rows not in
// `scopedRows` are left intact (no upsert). `deletes` is necessarily empty and
// `order` is unchanged — a scoped notify never asserts membership/order, so a
// concurrently-deleted row is corrected by the delete site's own FULL notify.
// Precondition: a snapshot for `pk` already exists (caller only enters the
// scoped path when `hadSnapshot`).
function diffKeyedScoped(
  entry: RegistryEntry,
  pk: string,
  scopedRows: unknown[],
): { upserts: [string, unknown][] } {
  const keyOf = entry.keyOf;
  if (!keyOf) {
    throw new Error(`[resources] keyed resource "${entry.key}" missing keyOf`);
  }
  const snap = entry.snapshots?.get(pk);
  if (!snap) {
    throw new Error(
      `[resources] diffKeyedScoped called for "${entry.key}" pk "${pk}" with no snapshot`,
    );
  }
  const upserts: [string, unknown][] = [];
  for (const row of scopedRows) {
    const id = keyOf(row);
    const hash = JSON.stringify(row);
    if (snap.get(id) !== hash) {
      upserts.push([id, row]);
      snap.set(id, hash);
    }
  }
  return { upserts };
}

async function flushNotifies(): Promise<void> {
  flushScheduled = false;
  rebuildDag();

  // Iterate upstream-first so cascades into downstream entries are picked up
  // later in the same loop. `pendingNotifies` is a Map keyed by paramsKey, so
  // cascaded-then-pre-existing notifies coalesce automatically.
  for (const entry of topoOrder) {
    if (entry.pendingNotifies.size === 0) continue;
    const pending = Array.from(entry.pendingNotifies.values());
    entry.pendingNotifies.clear();
    for (const { params, affected } of pending) {
      const pk = paramsKey(params);
      // Scoped notify (Layer 2): `affected !== null` means recompute only those
      // row ids. An empty scoped set = nothing actually changed → skip the send
      // entirely (no version bump, no empty delta, no cascade).
      const scoped = affected !== null;
      if (scoped && affected.size === 0) continue;
      const version = (entry.versions.get(pk) ?? 0) + 1;
      entry.versions.set(pk, version);
      const subs = subscribersFor(entry.key, pk);

      // Compute value once if either a subscriber (push mode) or any
      // value-aware downstream `map` needs it. For invalidate-mode upstreams
      // we still compute when a map wants it — rare today, acceptable cost.
      // `affectedMap` self-queries the DB and must NOT force the value, else we
      // reintroduce the full upstream load Layer 2 is removing.
      const hasValueAwareDownstream = entry.downstream.some((d) => d.map !== undefined);
      const needValue =
        ((entry.mode === "push" || entry.mode === "keyed") && subs.length > 0) ||
        hasValueAwareDownstream;
      const ctx = scoped ? { affectedIds: [...affected] } : undefined;
      let value: unknown;
      let valueComputed = false;
      if (needValue) {
        try {
          value = await timedLoad(entry, params, ctx);
          valueComputed = true;
        } catch (err) {
          console.error(`[resources] loader failed for ${entry.key}`, err);
          reportServerError(errorReport(`loader failed for ${entry.key}`, err));
          // Skip sending and cascading on loader failure — otherwise we'd
          // invalidate downstream state based on a torn read.
          continue;
        }
      }

      if (subs.length > 0) {
        if (entry.mode === "invalidate") {
          const msg = { kind: "invalidate" as const, key: entry.key, params, version };
          for (const s of subs) sendJson(s.ws, msg);
        } else if (entry.mode === "keyed") {
          // `value` is guaranteed computed (needValue is true for keyed + subs).
          const hadSnapshot = entry.snapshots?.has(pk) ?? false;
          if (scoped && !hadSnapshot) {
            // Near-unreachable: a subscribed pk always seeded a snapshot at
            // sub-ack. If we somehow get here, the scoped `value` is partial and
            // unsafe for diffKeyed — reload the FULL value and diff that.
            let full: unknown;
            try {
              full = await timedLoad(entry, params, undefined);
            } catch (err) {
              console.error(`[resources] loader failed for ${entry.key}`, err);
              reportServerError(errorReport(`loader failed for ${entry.key}`, err));
              continue;
            }
            // hadSnapshot was false ⇒ ship a full update base. diffKeyed here
            // serves only to (re)seed the snapshot from the full value.
            diffKeyed(entry, pk, full);
            const msg = {
              kind: "update" as const,
              key: entry.key,
              params,
              value: full,
              version,
            };
            for (const s of subs) sendJson(s.ws, msg);
          } else if (scoped) {
            // Scoped path: merge the partial recompute into the snapshot and
            // ship only the changed rows. `deletes:[]`, `order:undefined` —
            // a scoped notify never asserts membership/order (those stay FULL).
            const { upserts } = diffKeyedScoped(entry, pk, value as unknown[]);
            if (upserts.length) {
              const msg = {
                kind: "delta" as const,
                key: entry.key,
                params,
                upserts,
                deletes: [] as string[],
                order: undefined,
                version,
              };
              for (const s of subs) sendJson(s.ws, msg);
            }
          } else {
            // FULL path (unchanged from Layer 1). diffKeyed replaces the stored
            // snapshot only here, after the loader succeeded — the loader-failure
            // `continue` above leaves it untouched.
            const { upserts, deletes, order } = diffKeyed(entry, pk, value);
            if (!hadSnapshot) {
              // First notify for this pk: ship a full update so brand-new
              // subscribers get a complete base to merge subsequent deltas onto.
              const msg = { kind: "update" as const, key: entry.key, params, value, version };
              for (const s of subs) sendJson(s.ws, msg);
            } else {
              const msg = {
                kind: "delta" as const,
                key: entry.key,
                params,
                upserts,
                deletes,
                order,
                version,
              };
              for (const s of subs) sendJson(s.ws, msg);
            }
          }
        } else {
          const msg = { kind: "update" as const, key: entry.key, params, value, version };
          for (const s of subs) sendJson(s.ws, msg);
        }
      }

      for (const edge of entry.downstream) {
        const down = registry.get(edge.downstreamKey);
        if (!down) continue;
        let derived: ResourceParams[];
        if (edge.map) {
          try {
            derived = edge.map(params, valueComputed ? value : undefined);
          } catch (err) {
            console.error(
              `[resources] dependsOn map failed (${entry.key} → ${edge.downstreamKey})`,
              err,
            );
            reportServerError(
              errorReport(`dependsOn map failed (${entry.key} → ${edge.downstreamKey})`, err),
            );
            continue;
          }
        } else {
          derived = [params];
        }
        // Compute the downstream affected set. Upstream FULL ⇒ FULL; no
        // affectedMap ⇒ FULL; a throwing affectedMap fails safe to FULL. Never
        // silently narrows a membership change.
        let downAffected: Set<string> | null;
        if (affected === null) {
          downAffected = null;
        } else if (!edge.affectedMap) {
          downAffected = null;
        } else {
          try {
            downAffected = new Set(await edge.affectedMap(affected, params));
          } catch (err) {
            console.error(
              `[resources] affectedMap failed (${entry.key} → ${edge.downstreamKey})`,
              err,
            );
            reportServerError(
              errorReport(`affectedMap failed (${entry.key} → ${edge.downstreamKey})`, err),
            );
            downAffected = null;
          }
        }
        for (const dp of derived) {
          mergePending(down.pendingNotifies, paramsKey(dp), dp, downAffected);
        }
      }
    }
  }
}

// --- WS handler ---

const HEARTBEAT_MS = 20_000;
const heartbeats = new Map<ServerWebSocket<WsData>, ReturnType<typeof setInterval>>();

export const notificationsWsHandler: WsHandler = {
  open(ws) {
    sockets.set(ws, { ws, subs: new Map() });
    const timer = setInterval(() => sendJson(ws, { kind: "ping" }), HEARTBEAT_MS);
    heartbeats.set(ws, timer);
  },
  message(ws, raw) {
    const state = sockets.get(ws);
    if (!state) return;
    let msg: unknown;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const m = msg as {
      op?: string;
      kind?: string;
      id?: number;
      key?: string;
      params?: ResourceParams;
    };
    if (m.kind === "pong") return;
    if (m.op === "sub") {
      void handleSub(state, m);
      return;
    }
    if (m.op === "unsub") {
      handleUnsub(state, m);
      return;
    }
  },
  close(ws) {
    const timer = heartbeats.get(ws);
    if (timer) clearInterval(timer);
    heartbeats.delete(ws);
    const state = sockets.get(ws);
    if (state) {
      for (const [key, inner] of state.subs) {
        for (const [pk, params] of inner) releaseSubRefcount(key, pk, params);
      }
    }
    sockets.delete(ws);
  },
};

async function handleSub(
  state: SocketState,
  m: { id?: number; key?: string; params?: ResourceParams },
): Promise<void> {
  const { id, key, params = {} } = m;
  if (!key) return;
  const entry = registry.get(key);
  if (!entry) {
    sendJson(state.ws, { kind: "sub-error", id, key, reason: "unknown-key" });
    return;
  }
  const pk = paramsKey(params);
  let inner = state.subs.get(key);
  if (!inner) {
    inner = new Map();
    state.subs.set(key, inner);
  }
  const alreadyHeldBySocket = inner.has(pk);
  inner.set(pk, params);
  if (!alreadyHeldBySocket) {
    const prev = entry.subCounts.get(pk) ?? 0;
    entry.subCounts.set(pk, prev + 1);
    if (prev === 0 && entry.onFirstSubscribe) {
      try {
        await entry.onFirstSubscribe(params);
      } catch (err) {
        console.error(`[resources] onFirstSubscribe failed for ${key}`, err);
        reportServerError(errorReport(`onFirstSubscribe failed for ${key}`, err));
      }
    }
  }

  let value: unknown;
  try {
    value = await timedLoad(entry, params);
  } catch (err) {
    console.error(`[resources] loader failed for ${key}`, err);
    reportServerError(errorReport(`loader failed for ${key}`, err));
    sendJson(state.ws, { kind: "sub-error", id, key, reason: "loader-failed" });
    return;
  }
  const version = (entry.versions.get(pk) ?? 0) + 1;
  entry.versions.set(pk, version);
  // Keyed entries: seed the per-pk snapshot from the full sub-ack value so the
  // next notify can diff against it. The sub-ack itself stays full-value.
  if (entry.mode === "keyed") {
    (entry.snapshots ??= new Map()).set(pk, snapshotOf(entry, value));
  }
  sendJson(state.ws, { kind: "sub-ack", id, key, params, value, version });
}

function handleUnsub(
  state: SocketState,
  m: { key?: string; params?: ResourceParams },
): void {
  const { key, params = {} } = m;
  if (!key) return;
  const inner = state.subs.get(key);
  if (!inner) return;
  const pk = paramsKey(params);
  if (!inner.has(pk)) return;
  inner.delete(pk);
  if (inner.size === 0) state.subs.delete(key);
  releaseSubRefcount(key, pk, params);
}

function releaseSubRefcount(key: string, pk: string, params: ResourceParams): void {
  const entry = registry.get(key);
  if (!entry) return;
  const prev = entry.subCounts.get(pk) ?? 0;
  if (prev <= 0) return;
  const next = prev - 1;
  if (next === 0) {
    entry.subCounts.delete(pk);
    // Bound keyed-snapshot memory to actively-observed pks. Re-subscribe
    // re-hydrates via a full sub-ack and rebuilds the snapshot.
    entry.snapshots?.delete(pk);
    if (entry.onLastUnsubscribe) {
      try {
        entry.onLastUnsubscribe(params);
      } catch (err) {
        console.error(`[resources] onLastUnsubscribe failed for ${key}`, err);
        reportServerError(errorReport(`onLastUnsubscribe failed for ${key}`, err));
      }
    }
  } else {
    entry.subCounts.set(pk, next);
  }
}

// --- HTTP handler ---

/** GET /api/resources/:key?foo=bar — returns {value, version}. */
export async function handleResourceHttp(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const key = params.key;
  if (!key) return new Response("Not found", { status: 404 });
  if (key === "_debug") return handleResourcesDebug();
  const entry = registry.get(key);
  if (!entry) return new Response("Unknown resource", { status: 404 });

  const url = new URL(req.url);
  const resourceParams: ResourceParams = {};
  for (const [k, v] of url.searchParams) resourceParams[k] = v;

  let value: unknown;
  try {
    value = await timedLoad(entry, resourceParams);
  } catch (err) {
    console.error(`[resources] loader failed for ${key}`, err);
    reportServerError(errorReport(`loader failed for ${key}`, err));
    return new Response("Loader failed", { status: 500 });
  }
  const pk = paramsKey(resourceParams);
  const version = entry.versions.get(pk) ?? 0;
  return new Response(JSON.stringify({ value, version }), {
    headers: { "content-type": "application/json" },
  });
}

function errorReport(context: string, err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    message: `[resources] ${context}: ${e.message}`,
    stack: e.stack ?? null,
    errorType: e.constructor.name !== "Error" ? e.constructor.name : null,
  };
}

function handleResourcesDebug(): Response {
  rebuildDag();
  const contributions = Resource.Declare.getContributions();
  const ownerByKey = new Map<string, { pluginId?: string; pluginName?: string }>();
  for (const c of contributions) {
    ownerByKey.set(c.key, { pluginId: c._pluginId, pluginName: c._pluginName });
  }
  const out: Array<{
    key: string;
    mode: ResourceMode;
    pluginId?: string;
    pluginName?: string;
    subscribers: number;
    versions: Record<string, number>;
    dependsOn: string[];
    downstream: string[];
  }> = [];
  for (const entry of registry.values()) {
    let subscribers = 0;
    for (const st of sockets.values()) {
      const inner = st.subs.get(entry.key);
      if (inner) subscribers += inner.size;
    }
    const owner = ownerByKey.get(entry.key);
    out.push({
      key: entry.key,
      mode: entry.mode,
      pluginId: owner?.pluginId,
      pluginName: owner?.pluginName,
      subscribers,
      versions: Object.fromEntries(entry.versions),
      dependsOn: entry.upstreamKeys,
      downstream: entry.downstream.map((d) => d.downstreamKey),
    });
  }
  return new Response(
    JSON.stringify(
      { topoOrder: topoOrder.map((e) => e.key), resources: out },
      null,
      2,
    ),
    { headers: { "content-type": "application/json" } },
  );
}
