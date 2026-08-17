import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// A jsdom suite: the aggregator prunes through `document.querySelectorAll` and
// caches through `localStorage`, so it needs a real DOM rather than the two
// hand-built stubs this file used to install on `globalThis` under bun:test.
// Style elements below are real `<style>` nodes in `document.head`, and
// "removed" is asked of the DOM itself (`isConnected`) instead of a bookkeeping
// flag on a fake — so the prune selector is exercised for real.
import {
  __resetPaintCacheAggregatorForTest,
  claimPaintStyle,
  releasePaintStyle,
  reportPaintStyle,
  setPaintContext,
} from "../internal/paint-cache-aggregator";

const KEY = "theme-engine:critical-css";

// queueMicrotask drains the flush/prune; flushMicrotasks awaits one turn.
const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

function addStyleEl(id: string): HTMLStyleElement {
  const el = document.createElement("style");
  el.id = id;
  document.head.appendChild(el);
  return el;
}

interface Envelope {
  v: number;
  entries: Record<string, { styles: Record<string, string>; mode: string }>;
}

function readEnvelope(): Envelope | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Envelope) : null;
}

// Non-null entry accessor for assertions (throws loudly if missing).
function entryOf(path: string): {
  styles: Record<string, string>;
  mode: string;
} {
  const env = readEnvelope();
  if (!env) throw new Error("no envelope written");
  const entry = env.entries[path];
  if (!entry) throw new Error(`no entry for path ${JSON.stringify(path)}`);
  return entry;
}

/** Count the envelope writes a block of work performs. */
function countWrites(): { writes: () => number; restore: () => void } {
  const spy = vi.spyOn(localStorage, "setItem");
  return {
    writes: () => spy.mock.calls.length,
    restore: () => spy.mockRestore(),
  };
}

describe("paint-cache-aggregator", () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.replaceChildren();
    __resetPaintCacheAggregatorForTest();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.head.replaceChildren();
  });

  test("report upsert: flush writes the full style map to the right path entry", async () => {
    // App focus → :root carries the app's theme → rootIsGlobal false.
    setPaintContext({ appPath: "/agents", mode: "dark", rootIsGlobal: false });
    reportPaintStyle("theme-engine-color-palette", ":root{--a:1}");
    reportPaintStyle(
      "theme-scope-app:agents-color-palette",
      '[data-theme-scope="app:agents"]{--a:2}',
    );
    await flushMicrotasks();

    expect(readEnvelope()?.v).toBe(3);
    expect(entryOf("/agents").styles).toEqual({
      "theme-engine-color-palette": ":root{--a:1}",
      "theme-scope-app:agents-color-palette":
        '[data-theme-scope="app:agents"]{--a:2}',
    });
    expect(entryOf("/agents").mode).toBe("dark");
    // App focus (rootIsGlobal false) → must NOT clobber the global "" entry.
    expect(readEnvelope()?.entries[""]).toBeUndefined();
  });

  test("global focus also writes the global '' entry; app focus does not", async () => {
    // Global/desktop focus → :root is the global theme → rootIsGlobal true.
    setPaintContext({ appPath: "/files", mode: "light", rootIsGlobal: true });
    reportPaintStyle("theme-engine-shape", ":root{--r:8px}");
    await flushMicrotasks();

    expect(entryOf("/files").styles).toEqual({
      "theme-engine-shape": ":root{--r:8px}",
    });
    // Global focus → mirrors into the "" global entry.
    expect(entryOf("").styles).toEqual({
      "theme-engine-shape": ":root{--r:8px}",
    });
  });

  test("report delete removes a style from the next flushed map", async () => {
    setPaintContext({
      appPath: "/agents",
      mode: "system",
      rootIsGlobal: false,
    });
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
    const { writes, restore } = countWrites();

    setPaintContext({ appPath: "/agents", mode: "dark", rootIsGlobal: false });
    reportPaintStyle("theme-engine-a", "1");
    reportPaintStyle("theme-engine-b", "2");
    reportPaintStyle("theme-engine-c", "3");
    await flushMicrotasks();

    expect(writes()).toBe(1);
    expect(Object.keys(entryOf("/agents").styles).length).toBe(3);
    restore();
  });

  test("unchanged report text is a no-op (no extra flush)", async () => {
    setPaintContext({ appPath: "/agents", mode: "dark", rootIsGlobal: false });
    reportPaintStyle("theme-engine-a", "1");
    await flushMicrotasks();

    const { writes, restore } = countWrites();
    reportPaintStyle("theme-engine-a", "1"); // identical → no schedule
    await flushMicrotasks();
    expect(writes()).toBe(0);
    restore();
  });

  test("setPaintContext re-flushes on change even with no style change", async () => {
    setPaintContext({ appPath: "/agents", mode: "light", rootIsGlobal: true });
    reportPaintStyle("theme-engine-a", "1");
    await flushMicrotasks();
    expect(entryOf("/agents").mode).toBe("light");

    setPaintContext({ appPath: "/agents", mode: "dark", rootIsGlobal: true });
    await flushMicrotasks();
    expect(entryOf("/agents").mode).toBe("dark");
  });

  test("prune removes unclaimed theme-* elements, keeps claimed ones", async () => {
    const claimedGlobal = addStyleEl("theme-engine-color-palette");
    const claimedScope = addStyleEl("theme-scope-app:agents-color-palette");
    const orphanGlobal = addStyleEl("theme-engine-removed-group");
    const orphanScope = addStyleEl("theme-scope-app:closed-color-palette");
    const unrelated = addStyleEl("some-other-style");

    claimPaintStyle("theme-engine-color-palette");
    claimPaintStyle("theme-scope-app:agents-color-palette");
    await flushMicrotasks();

    expect(claimedGlobal.isConnected).toBe(true);
    expect(claimedScope.isConnected).toBe(true);
    expect(orphanGlobal.isConnected).toBe(false);
    expect(orphanScope.isConnected).toBe(false);
    // The prune selector never matches non-theme ids.
    expect(unrelated.isConnected).toBe(true);
  });

  test("release un-claims so a later prune removes the element", async () => {
    const el = addStyleEl("theme-engine-a");
    claimPaintStyle("theme-engine-a");
    await flushMicrotasks();
    expect(el.isConnected).toBe(true);

    releasePaintStyle("theme-engine-a");
    // Trigger another prune via a new claim.
    addStyleEl("theme-engine-b");
    claimPaintStyle("theme-engine-b");
    await flushMicrotasks();
    expect(el.isConnected).toBe(false);
  });
});
