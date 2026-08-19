// Shared vitest setup: pin the clock and stub browser APIs missing from jsdom
// (loaded by every DOM suite via the root vitest.config.ts `setupFiles`).

import { afterEach, beforeEach, vi } from "vitest";

// The instant every jsdom test starts at. A test must not be able to depend on
// what day it is run on — the failure mode is a suite that is green for a month
// and red the next, for everyone, with no code change at all. That is not
// hypothetical: the date-editor integration suite rendered a real calendar and
// reasoned about which cell carried which number, an argument that only held
// while "today" stayed outside the month under test.
//
// Only `Date` is faked, and `shouldAdvanceTime` keeps it ticking forward in real
// time. `setTimeout`, `setInterval` and `performance` stay real, so `waitFor`,
// React's scheduling and every genuinely async path behave exactly as before:
// the ORIGIN is pinned, not the flow of time.
//
// The sinon-backed `useFakeTimers` path is deliberate. A bare `vi.setSystemTime`
// with no fake timers installed takes vitest's own date-mock path, which swaps
// `globalThis.Date` for a subclass carrying no `Symbol.hasInstance` — every
// `Date` built before the swap then stops being `instanceof Date`. Sinon's
// `ClockDate` defines that symbol against the native constructor, so dates from
// either side of the install still answer `instanceof` correctly. Trading a time
// bomb for a footgun would not be a fix.
//
// This is a FLOOR, not a value to assert against. A suite whose assertions
// depend on "today" — `aria-current="date"`, the Today/Tomorrow presets — still
// pins its own instant explicitly, the way
// `plugins/primitives/plugins/date-picker/web/__tests__/calendar-grid.test.tsx`
// does; and a file installing its own fake timers overrides this completely,
// since each `vi.useFakeTimers()` uninstalls the clock before it.
const TEST_NOW = new Date(2026, 5, 15, 12, 0, 0); // Monday 15 June 2026, local noon

function pinTestClock(): void {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(TEST_NOW);
}

// Once at setup-evaluation time — setup files run BEFORE the test module, so a
// module-scope `new Date()` constant in a suite is pinned too — and again per
// test, to re-assert the pin for a file that hands the clock back in its own
// `afterEach`.
pinTestClock();
beforeEach(pinTestClock);
afterEach(() => {
  vi.useRealTimers();
});

Object.defineProperty(window, "matchMedia", {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

HTMLCanvasElement.prototype.getContext = (() => null) as never;

// jsdom ships no ResizeObserver, so any component reaching the `element-size`
// primitive (StickyStack, data-table, Expandable, …) throws on mount. The stub is
// deliberately inert rather than a polyfill: jsdom has no layout engine, so
// `getBoundingClientRect` is all-zero and elements never resize — a polling
// polyfill would observe a 0x0 box forever and fire nothing. `element-size` is
// built for exactly this (see its CLAUDE.md, "Why a synchronous initial measure"):
// the one synchronous measure inside the layout effect is enough to decide layout
// under a no-op observer.
//
// So this supplies the global's *existence* only. A test needing a non-zero size
// stubs the measurement source itself (see `expandable`'s `offsetHeight` fixture);
// a test needing to *drive* resizes installs its own drivable observer with
// `vi.stubGlobal`, which wins over this one.
class InertResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: InertResizeObserver,
  configurable: true,
  writable: true,
});

// jsdom under vitest exposes a non-functional `localStorage` (Node's
// `--localstorage-file` stub). Install a deterministic in-memory Storage so code
// under test that persists to localStorage works and starts each file clean.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(window, "localStorage", {
  value: memoryStorage,
  configurable: true,
});
Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage,
  configurable: true,
});
