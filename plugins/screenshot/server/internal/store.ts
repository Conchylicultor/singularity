const ONE_HOUR_MS = 60 * 60 * 1000;

interface Entry {
  png: Uint8Array;
  createdAt: number;
}

const store = new Map<string, Entry>();

function gc(now: number) {
  for (const [id, entry] of store) {
    if (now - entry.createdAt > ONE_HOUR_MS) store.delete(id);
  }
}

export function put(png: Uint8Array): string {
  const now = Date.now();
  gc(now);
  const id = crypto.randomUUID();
  store.set(id, { png, createdAt: now });
  return id;
}

export function get(id: string): Uint8Array | null {
  return store.get(id)?.png ?? null;
}
