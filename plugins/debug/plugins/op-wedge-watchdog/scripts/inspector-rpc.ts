/**
 * inspector-rpc.ts — minimal Bun/JSC Inspector protocol client (JSON-RPC over a
 * plain WebSocket), shared by the manual `inspector-client.ts` and the
 * watchdog's automated `js-interrogate.ts`.
 *
 * Bun speaks the WebKit/JSC Inspector protocol. Ops launch pre-armed with
 * `bun --inspect=localhost:<port>/<token>` (cli/bin/inspect.ts); the op marker's
 * `inspect` field carries the URL. Commands dispatch on the target's JS thread —
 * a never-yielding hot loop is uninspectable, but real wedges service timers
 * (punctual heartbeats), so they answer (verified 2026-07-21/22).
 */

interface RpcMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

export interface InspectorRpc {
  /** Send a command and await its response. */
  send: (method: string, params?: object, timeoutMs?: number) => Promise<unknown>;
  /** Fire a command whose response we don't need (payload arrives as an event). */
  notify: (method: string, params?: object) => void;
  /** Await a protocol event by method name (also matches already-received ones). */
  waitEvent: (method: string, timeoutMs?: number) => Promise<unknown>;
  close: () => void;
}

export async function connectInspector(url: string): Promise<InspectorRpc> {
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const events: { method: string; params: unknown }[] = [];
  const eventWaiters: { method: string; resolve: (p: unknown) => void }[] = [];

  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
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

  return { send, notify, waitEvent, close: () => ws.close() };
}

/**
 * Runtime.evaluate an expression and return its `returnByValue` value, throwing
 * on `wasThrown` — a thrown eval must never read as a legitimate result.
 */
export async function evalInTarget(
  rpc: InspectorRpc,
  expression: string,
  timeoutMs = 10000,
): Promise<unknown> {
  const r = (await rpc.send("Runtime.evaluate", { expression, returnByValue: true }, timeoutMs)) as {
    result?: { value?: unknown; description?: string };
    wasThrown?: boolean;
  };
  if (r.wasThrown) {
    throw new Error(`eval threw in target: ${r.result?.description ?? "(no description)"}`);
  }
  return r.result?.value;
}
