import type { ServerWebSocket } from "bun";
import type { ZodType } from "zod";
import type { WsData, WsHandler } from "./types";

// Live-state primitive — central-side. Mirror of server/src/resources.ts; the
// design doc (research/2026-04-26-global-central-runtime.md) tolerates this
// duplication for v1. Consolidate into a shared package once both runtimes
// have a few resources each.
//
// Browsers reach this side via /ws/central-notifications (gateway routes the
// path to central regardless of host) and the /api/central-resources/:key
// HTTP fallback.

export type ResourceMode = "push" | "invalidate";
export type ResourceParams = Record<string, string>;

export interface DependsOnEntry<P extends ResourceParams = ResourceParams> {
  // biome-ignore lint/suspicious/noExplicitAny: upstream type is erased — the map callback owns the shape.
  resource: Resource<any, any>;
  map?: (
    // biome-ignore lint/suspicious/noExplicitAny: see above.
    upstreamParams: any,
    upstreamValue: unknown,
  ) => P[];
}

export interface ResourceDefinition<T, P extends ResourceParams = ResourceParams> {
  key: string;
  mode?: ResourceMode;
  loader: (params: P) => Promise<T> | T;
  /**
   * Zod schema for the payload. The descriptor exposed to clients carries
   * this schema so the browser parses every payload before it lands in the
   * TanStack cache. Currently optional during the staged migration; will
   * become required once every resource declares one. See
   * research/2026-04-29-global-resource-schema-validation.md.
   */
  schema?: ZodType<T>;
  dependsOn?: ReadonlyArray<DependsOnEntry<P>>;
  onFirstSubscribe?: (params: P) => void | Promise<void>;
  onLastUnsubscribe?: (params: P) => void;
}

export interface Resource<T, P extends ResourceParams = ResourceParams> {
  key: string;
  mode: ResourceMode;
  schema?: ZodType<T>;
  load(params: P): Promise<T>;
  notify(params?: P): void;
}

interface DownstreamEdge {
  downstreamKey: string;
  map?: (upstreamParams: ResourceParams, upstreamValue: unknown) => ResourceParams[];
}

interface RegistryEntry {
  key: string;
  mode: ResourceMode;
  loader: (params: ResourceParams) => Promise<unknown> | unknown;
  versions: Map<string, number>;
  pendingNotifies: Map<string, ResourceParams>;
  subCounts: Map<string, number>;
  upstreamKeys: string[];
  downstream: DownstreamEdge[];
  onFirstSubscribe?: (params: ResourceParams) => void | Promise<void>;
  onLastUnsubscribe?: (params: ResourceParams) => void;
}

const registry = new Map<string, RegistryEntry>();
let dagDirty = true;
let topoOrder: RegistryEntry[] = [];

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
      },
    });
  }
  const entry: RegistryEntry = {
    key: def.key,
    mode,
    loader: def.loader as (params: ResourceParams) => Promise<unknown> | unknown,
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
      return (await def.loader(params)) as T;
    },
    notify(params?: P): void {
      scheduleNotify(entry, (params ?? ({} as P)) as ResourceParams);
    },
  };
}

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
      console.warn(`[resources] dependsOn cycle detected: ${cycle.join(" -> ")}`);
    }
  }

  topoOrder = order;
}

interface SocketState {
  ws: ServerWebSocket<WsData>;
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
  } catch {
    // close handler will clean up
  }
}

let flushScheduled = false;
function scheduleNotify(entry: RegistryEntry, params: ResourceParams): void {
  entry.pendingNotifies.set(paramsKey(params), params);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => { void flushNotifies(); });
}

async function flushNotifies(): Promise<void> {
  flushScheduled = false;
  rebuildDag();

  for (const entry of topoOrder) {
    if (entry.pendingNotifies.size === 0) continue;
    const pending = Array.from(entry.pendingNotifies.values());
    entry.pendingNotifies.clear();
    for (const params of pending) {
      const pk = paramsKey(params);
      const version = (entry.versions.get(pk) ?? 0) + 1;
      entry.versions.set(pk, version);
      const subs = subscribersFor(entry.key, pk);

      const hasValueAwareDownstream = entry.downstream.some((d) => d.map !== undefined);
      const needValue =
        (entry.mode === "push" && subs.length > 0) || hasValueAwareDownstream;
      let value: unknown;
      let valueComputed = false;
      if (needValue) {
        try {
          value = await entry.loader(params);
          valueComputed = true;
        } catch (err) {
          console.error(`[resources] loader failed for ${entry.key}`, err);
          continue;
        }
      }

      if (subs.length > 0) {
        if (entry.mode === "invalidate") {
          const msg = { kind: "invalidate" as const, key: entry.key, params, version };
          for (const s of subs) sendJson(s.ws, msg);
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
            continue;
          }
        } else {
          derived = [params];
        }
        for (const dp of derived) {
          down.pendingNotifies.set(paramsKey(dp), dp);
        }
      }
    }
  }
}

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
      }
    }
  }

  let value: unknown;
  try {
    value = await entry.loader(params);
  } catch (err) {
    console.error(`[resources] loader failed for ${key}`, err);
    sendJson(state.ws, { kind: "sub-error", id, key, reason: "loader-failed" });
    return;
  }
  const version = (entry.versions.get(pk) ?? 0) + 1;
  entry.versions.set(pk, version);
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
    if (entry.onLastUnsubscribe) {
      try {
        entry.onLastUnsubscribe(params);
      } catch (err) {
        console.error(`[resources] onLastUnsubscribe failed for ${key}`, err);
      }
    }
  } else {
    entry.subCounts.set(pk, next);
  }
}

/** GET /api/central-resources/:key?foo=bar — returns {value, version}. */
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
    value = await entry.loader(resourceParams);
  } catch (err) {
    console.error(`[resources] loader failed for ${key}`, err);
    return new Response("Loader failed", { status: 500 });
  }
  const pk = paramsKey(resourceParams);
  const version = entry.versions.get(pk) ?? 0;
  return new Response(JSON.stringify({ value, version }), {
    headers: { "content-type": "application/json" },
  });
}

function handleResourcesDebug(): Response {
  rebuildDag();
  const out: Array<{
    key: string;
    mode: ResourceMode;
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
    out.push({
      key: entry.key,
      mode: entry.mode,
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
