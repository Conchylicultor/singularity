import { beforeAll, describe, expect, it } from "bun:test";

// The window store hydrates + persists against `window` / `sessionStorage`, both
// undefined in bun. Stub a minimal in-memory pair BEFORE importing the module so
// `hydrate()` proceeds (minting the default desktop) and `persist()` is a no-op
// success rather than a thrown ReferenceError. This lets the otherwise DOM-bound
// store be exercised as plain module-global state — the desktop ops are pure
// reassignments over that state, so no real DOM is needed here.
beforeAll(() => {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as Record<string, unknown>).window = { sessionStorage };
  (globalThis as Record<string, unknown>).sessionStorage = sessionStorage;
});

// Imported lazily (after the stub) so the module's first `hydrate()` sees a DOM.
const {
  createDesktop,
  getDesktopsState,
  moveWindowToDesktop,
  removeDesktop,
  setActiveDesktop,
  splitTabToNewWindow,
  topmostWindowOnDesktop,
  windowForTab,
  getFloatingWindow,
} = await import("./use-floating-windows");

/**
 * The store is module-global, so state accumulates across tests in this file —
 * each test creates its OWN desktops/windows and asserts on them by id rather
 * than assuming a clean slate. `splitTabToNewWindow(tabId)` on an unknown tab
 * mints a fresh singleton window on the active desktop (the only imperative
 * window-creation path reachable without React), which we use as the fixture.
 */
function makeWindowOn(desktopId: string, tabId: string): string {
  setActiveDesktop(desktopId);
  splitTabToNewWindow(tabId);
  const id = windowForTab(tabId)!;
  return id;
}

describe("virtual desktops", () => {
  it("guarantees a default desktop after first access", () => {
    const { desktops, activeDesktopId } = getDesktopsState();
    expect(desktops.length).toBeGreaterThanOrEqual(1);
    expect(desktops.some((d) => d.id === activeDesktopId)).toBe(true);
  });

  it("createDesktop appends a desktop and returns its id; activate switches", () => {
    const before = getDesktopsState().desktops.length;
    const id = createDesktop();
    const after = getDesktopsState();
    expect(after.desktops.length).toBe(before + 1);
    expect(after.desktops.some((d) => d.id === id)).toBe(true);
    // Without activate the active desktop is unchanged.
    expect(after.activeDesktopId).not.toBe(id);

    const activeId = createDesktop({ activate: true });
    expect(getDesktopsState().activeDesktopId).toBe(activeId);
  });

  it("setActiveDesktop no-ops on an unknown or already-active id", () => {
    const a = createDesktop({ activate: true });
    setActiveDesktop("nope");
    expect(getDesktopsState().activeDesktopId).toBe(a);
    setActiveDesktop(a); // already active
    expect(getDesktopsState().activeDesktopId).toBe(a);
  });

  it("moveWindowToDesktop reassigns the window (no-op if unchanged/unknown)", () => {
    const a = createDesktop();
    const b = createDesktop();
    const wid = makeWindowOn(a, "tab-move-1");
    expect(getFloatingWindow(wid)!.desktopId).toBe(a);

    moveWindowToDesktop(wid, b);
    expect(getFloatingWindow(wid)!.desktopId).toBe(b);

    // Unknown desktop / unchanged → no change.
    moveWindowToDesktop(wid, "ghost");
    expect(getFloatingWindow(wid)!.desktopId).toBe(b);
    moveWindowToDesktop("ghost-window", a);
    expect(getFloatingWindow(wid)!.desktopId).toBe(b);
  });

  it("removeDesktop reassigns its windows to the prior neighbour and can't remove the last", () => {
    const a = createDesktop();
    const b = createDesktop();
    const wid = makeWindowOn(b, "tab-remove-1");
    expect(getFloatingWindow(wid)!.desktopId).toBe(b);

    // Removing b (active) reassigns its window to the prior desktop (a) and makes
    // a active.
    setActiveDesktop(b);
    removeDesktop(b);
    expect(getDesktopsState().desktops.some((d) => d.id === b)).toBe(false);
    expect(getFloatingWindow(wid)!.desktopId).toBe(a);
    expect(getDesktopsState().activeDesktopId).toBe(a);

    // Can never remove the final desktop: trim down to one, then a remove no-ops.
    let state = getDesktopsState();
    for (const d of state.desktops.slice(1)) removeDesktop(d.id);
    state = getDesktopsState();
    expect(state.desktops.length).toBe(1);
    const lone = state.desktops[0]!.id;
    removeDesktop(lone);
    expect(getDesktopsState().desktops.length).toBe(1);
  });

  it("topmostWindowOnDesktop picks the highest-z non-minimized window", () => {
    const d = createDesktop();
    const w1 = makeWindowOn(d, "tab-top-1");
    const w2 = makeWindowOn(d, "tab-top-2");
    // splitTabToNewWindow reorders z densely; the most recently minted lands on
    // top, so the topmost is whichever has the highest z among the two.
    const top = topmostWindowOnDesktop(d);
    expect(top).toBeDefined();
    const z1 = getFloatingWindow(w1)!.geo.z;
    const z2 = getFloatingWindow(w2)!.geo.z;
    expect(top!.id).toBe(z1 > z2 ? w1 : w2);

    // An empty desktop has no topmost window.
    const empty = createDesktop();
    expect(topmostWindowOnDesktop(empty)).toBeUndefined();
  });
});
