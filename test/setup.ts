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
