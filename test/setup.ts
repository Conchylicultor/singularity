// Shared vitest setup: stub browser APIs missing from jsdom (loaded by every
// DOM suite via the root vitest.config.ts `setupFiles`).

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
Object.defineProperty(window, "localStorage", { value: memoryStorage, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true });
