import { readFile, writeFile, unlink, mkdir, readdir, rename, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import * as parcel from "@parcel/watcher";
import type { ConfigStore, JsonValue, Disposable } from "../../core";

const DEBOUNCE_MS = 100;
const CEILING_MS = 1000;
const RECONCILE_MS = 30_000;

let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tmp, content, { encoding: "utf8" });
    await rename(tmp, filePath);
  } catch (err) {
    await unlink(tmp).catch((unlinkErr: unknown) => {
      if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkErr;
    });
    throw err;
  }
}

async function readJsoncFile(filePath: string): Promise<JsonValue | undefined> {
  let text: string;
  try {
    text = await readFile(filePath, { encoding: "utf8" });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const errors: ParseError[] = [];
  const value = parseJsonc(text, errors);
  if (errors.length > 0) {
    console.warn(`[config-store] JSONC parse error in ${filePath}:`, errors);
    return undefined;
  }
  return value as JsonValue;
}

function resolvePath(configDir: string, storePath: string): string {
  const abs = path.resolve(configDir, storePath);
  if (!abs.startsWith(configDir + path.sep) && abs !== configDir) {
    throw new Error(`[config-store] path "${storePath}" escapes CONFIG_DIR`);
  }
  return abs;
}

async function walkJsonc(dir: string, base: string, out: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  for (const name of entries) {
    if (base === "" && name === ".applied") continue;
    if (name.startsWith(".")) continue;
    const rel = base ? `${base}/${name}` : name;
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walkJsonc(full, rel, out);
    } else if (info.isFile() && name.endsWith(".jsonc")) {
      out.push(rel);
    }
  }
}

type WatchCallback = (value: JsonValue | undefined) => void;

export class JsoncConfigStore implements ConfigStore {
  private readonly watchers = new Map<string, Set<WatchCallback>>();
  private subscription: parcel.AsyncSubscription | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private ceilingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastRecompute = new Map<string, number>();

  constructor(private readonly configDir: string) {}

  async read(storePath: string): Promise<JsonValue | undefined> {
    const abs = resolvePath(this.configDir, storePath);
    return readJsoncFile(abs);
  }

  async write(storePath: string, value: JsonValue): Promise<void> {
    const abs = resolvePath(this.configDir, storePath);
    const content = JSON.stringify(value, null, 2) + "\n";
    return enqueueWrite(() => atomicWrite(abs, content));
  }

  watch(storePath: string, cb: WatchCallback): Disposable {
    const abs = resolvePath(this.configDir, storePath);

    let cbs = this.watchers.get(abs);
    if (!cbs) {
      cbs = new Set();
      this.watchers.set(abs, cbs);
    }
    cbs.add(cb);

    this.ensureSubscription();

    // Seed read — fire cb with current value
    void readJsoncFile(abs).then((val) => {
      if (cbs!.has(cb)) cb(val);
    });

    return {
      dispose: () => {
        cbs!.delete(cb);
        if (cbs!.size === 0) {
          this.watchers.delete(abs);
        }
      },
    };
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    await walkJsonc(this.configDir, "", out);
    return out;
  }

  /** Tear down the watcher subscription and timers. */
  async shutdown(): Promise<void> {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    for (const t of this.ceilingTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    this.ceilingTimers.clear();
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  private ensureSubscription(): void {
    if (this.subscription) return;

    void parcel.subscribe(this.configDir, (err, events) => {
      if (err) {
        console.error("[config-store] watcher error:", err);
        return;
      }
      for (const event of events) {
        if (!event.path.endsWith(".jsonc")) continue;
        if (event.path.includes(`${path.sep}.applied${path.sep}`)) continue;
        if (this.watchers.has(event.path)) {
          this.scheduleNotify(event.path);
        }
      }
    }).then((sub) => {
      this.subscription = sub;
    });

    this.reconcileTimer = setInterval(() => {
      for (const abs of this.watchers.keys()) {
        this.fireNotify(abs);
      }
    }, RECONCILE_MS);
  }

  private scheduleNotify(abs: string): void {
    if (this.debounceTimers.has(abs)) return;

    const since = Date.now() - (this.lastRecompute.get(abs) ?? 0);
    const delay = since >= CEILING_MS ? DEBOUNCE_MS : Math.min(DEBOUNCE_MS, CEILING_MS - since);

    this.debounceTimers.set(abs, setTimeout(() => {
      this.debounceTimers.delete(abs);
      this.fireNotify(abs);
    }, delay));

    if (!this.ceilingTimers.has(abs)) {
      this.ceilingTimers.set(abs, setTimeout(() => {
        this.ceilingTimers.delete(abs);
        if (this.debounceTimers.has(abs)) {
          clearTimeout(this.debounceTimers.get(abs)!);
          this.debounceTimers.delete(abs);
          this.fireNotify(abs);
        }
      }, CEILING_MS));
    }
  }

  private fireNotify(abs: string): void {
    this.lastRecompute.set(abs, Date.now());
    const ceilingTimer = this.ceilingTimers.get(abs);
    if (ceilingTimer) {
      clearTimeout(ceilingTimer);
      this.ceilingTimers.delete(abs);
    }

    const cbs = this.watchers.get(abs);
    if (!cbs || cbs.size === 0) return;

    void readJsoncFile(abs).then((val) => {
      for (const cb of cbs) cb(val);
    });
  }
}

export async function createJsoncConfigStore(configDir: string): Promise<JsoncConfigStore> {
  await mkdir(configDir, { recursive: true });
  return new JsoncConfigStore(configDir);
}
