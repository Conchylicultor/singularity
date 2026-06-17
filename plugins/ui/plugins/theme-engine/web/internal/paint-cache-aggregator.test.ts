import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// In-memory localStorage stub (bun:test has no DOM). theme-cache reads/writes via
// the global `localStorage`; the aggregator writes through writeCriticalCss.
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

// document stub for the prune pass: a flat registry of `<style>` elements by id.
interface FakeStyle {
  id: string;
  removed: boolean;
  remove: () => void;
}
const elements: FakeStyle[] = [];
const documentStub = {
  querySelectorAll: (selector: string) => {
    // The aggregator queries: style[id^="theme-engine-"], style[id^="theme-scope-"]
    const prefixes = selector
      .split(",")
      .map((s) => s.trim())
      .map((s) => s.replace(/^style\[id\^="/, "").replace(/"\]$/, ""));
    return elements.filter(
      (el) => !el.removed && prefixes.some((p) => el.id.startsWith(p)),
    );
  },
};

(globalThis as unknown as { localStorage: typeof localStorageStub }).localStorage =
  localStorageStub;
(globalThis as unknown as { document: typeof documentStub }).document = documentStub;

const KEY = "theme-engine:critical-css";

// queueMicrotask drains the flush/prune; flushMicrotasks awaits one turn.
const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

function addStyleEl(id: string): FakeStyle {
  const el: FakeStyle = {
    id,
    removed: false,
    remove() {
      this.removed = true;
    },
  };
  elements.push(el);
  return el;
}

interface Envelope {
  v: number;
  entries: Record<string, { styles: Record<string, string>; mode: string }>;
}

function readEnvelope(): Envelope | null {
  const raw = store.get(KEY);
  return raw ? (JSON.parse(raw) as Envelope) : null;
}

// Non-null entry accessor for assertions (throws loudly if missing).
function entryOf(path: string): { styles: Record<string, string>; mode: string } {
  const env = readEnvelope();
  if (!env) throw new Error("no envelope written");
  const entry = env.entries[path];
  if (!entry) throw new Error(`no entry for path ${JSON.stringify(path)}`);
  return entry;
}

// Import after the global stubs are installed (theme-cache reads localStorage at
// call time, not import time, so order is not strictly required — but explicit).
import {
  __resetPaintCacheAggregatorForTest,
  claimPaintStyle,
  releasePaintStyle,
  reportPaintStyle,
  setPaintContext,
} from "./paint-cache-aggregator";

describe("paint-cache-aggregator", () => {
  beforeEach(() => {
    store.clear();
    elements.length = 0;
    __resetPaintCacheAggregatorForTest();
  });
  afterEach(() => {
    store.clear();
    elements.length = 0;
  });

  test("report upsert: flush writes the full style map to the right path entry", async () => {
    setPaintContext({ appPath: "/agents", mode: "dark", forked: true });
    reportPaintStyle("theme-engine-color-palette", ":root{--a:1}");
    reportPaintStyle('theme-scope-app:agents-color-palette', '[data-theme-scope="app:agents"]{--a:2}');
    await flushMicrotasks();

    expect(readEnvelope()?.v).toBe(2);
    expect(entryOf("/agents").styles).toEqual({
      "theme-engine-color-palette": ":root{--a:1}",
      'theme-scope-app:agents-color-palette': '[data-theme-scope="app:agents"]{--a:2}',
    });
    expect(entryOf("/agents").mode).toBe("dark");
    // Forked → must NOT clobber the global "" entry.
    expect(readEnvelope()?.entries[""]).toBeUndefined();
  });

  test("unforked app also writes the global '' entry; forked does not", async () => {
    setPaintContext({ appPath: "/files", mode: "light", forked: false });
    reportPaintStyle("theme-engine-shape", ":root{--r:8px}");
    await flushMicrotasks();

    expect(entryOf("/files").styles).toEqual({ "theme-engine-shape": ":root{--r:8px}" });
    // Unforked → mirrors into the "" global entry.
    expect(entryOf("").styles).toEqual({ "theme-engine-shape": ":root{--r:8px}" });
  });

  test("report delete removes a style from the next flushed map", async () => {
    setPaintContext({ appPath: "/agents", mode: "system", forked: true });
    reportPaintStyle("theme-engine-a", "x");
    reportPaintStyle("theme-engine-b", "y");
    await flushMicrotasks();
    expect(Object.keys(entryOf("/agents").styles).sort()).toEqual([
      "theme-engine-a",
      "theme-engine-b",
    ]);

    reportPaintStyle("theme-engine-a", null);
    await flushMicrotasks();
    expect(Object.keys(entryOf("/agents").styles)).toEqual(["theme-engine-b"]);
  });

  test("multiple reports in one tick coalesce into a single flush write", async () => {
    let writes = 0;
    const realSet = localStorageStub.setItem;
    const spy = mock((k: string, v: string) => {
      writes++;
      realSet(k, v);
    });
    localStorageStub.setItem = spy as typeof localStorageStub.setItem;

    setPaintContext({ appPath: "/agents", mode: "dark", forked: true });
    reportPaintStyle("theme-engine-a", "1");
    reportPaintStyle("theme-engine-b", "2");
    reportPaintStyle("theme-engine-c", "3");
    await flushMicrotasks();

    expect(writes).toBe(1);
    expect(Object.keys(entryOf("/agents").styles).length).toBe(3);
    localStorageStub.setItem = realSet;
  });

  test("unchanged report text is a no-op (no extra flush)", async () => {
    setPaintContext({ appPath: "/agents", mode: "dark", forked: true });
    reportPaintStyle("theme-engine-a", "1");
    await flushMicrotasks();

    let writes = 0;
    const realSet = localStorageStub.setItem;
    localStorageStub.setItem = ((k: string, v: string) => {
      writes++;
      realSet(k, v);
    }) as typeof localStorageStub.setItem;

    reportPaintStyle("theme-engine-a", "1"); // identical → no schedule
    await flushMicrotasks();
    expect(writes).toBe(0);
    localStorageStub.setItem = realSet;
  });

  test("setPaintContext re-flushes on change even with no style change", async () => {
    setPaintContext({ appPath: "/agents", mode: "light", forked: false });
    reportPaintStyle("theme-engine-a", "1");
    await flushMicrotasks();
    expect(entryOf("/agents").mode).toBe("light");

    setPaintContext({ appPath: "/agents", mode: "dark", forked: false });
    await flushMicrotasks();
    expect(entryOf("/agents").mode).toBe("dark");
  });

  test("prune removes unclaimed theme-* elements, keeps claimed ones", async () => {
    const claimedGlobal = addStyleEl("theme-engine-color-palette");
    const claimedScope = addStyleEl('theme-scope-app:agents-color-palette');
    const orphanGlobal = addStyleEl("theme-engine-removed-group");
    const orphanScope = addStyleEl('theme-scope-app:closed-color-palette');
    const unrelated = addStyleEl("some-other-style");

    claimPaintStyle("theme-engine-color-palette");
    claimPaintStyle('theme-scope-app:agents-color-palette');
    await flushMicrotasks();

    expect(claimedGlobal.removed).toBe(false);
    expect(claimedScope.removed).toBe(false);
    expect(orphanGlobal.removed).toBe(true);
    expect(orphanScope.removed).toBe(true);
    // The prune selector never matches non-theme ids.
    expect(unrelated.removed).toBe(false);
  });

  test("release un-claims so a later prune removes the element", async () => {
    const el = addStyleEl("theme-engine-a");
    claimPaintStyle("theme-engine-a");
    await flushMicrotasks();
    expect(el.removed).toBe(false);

    releasePaintStyle("theme-engine-a");
    // Trigger another prune via a new claim.
    addStyleEl("theme-engine-b");
    claimPaintStyle("theme-engine-b");
    await flushMicrotasks();
    expect(el.removed).toBe(true);
  });
});
