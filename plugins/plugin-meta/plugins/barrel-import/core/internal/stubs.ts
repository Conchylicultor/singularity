import { registerAutoStubs } from "./auto-stubs.generated";

let registered = false;

/**
 * Registers Bun runtime stubs so web/server barrel files can be imported
 * outside the browser. Must be called once before any `importBarrel()` call.
 *
 * Uses build.module() for virtual modules (React, web-sdk/core, DOM-heavy packages)
 * and build.onLoad() for CSS files. Path aliases (@/* → web/src/*) are
 * resolved via the root tsconfig.json.
 */
export function registerBarrelStubs(_repoRoot: string): void {
  if (registered) return;
  registered = true;

  // Server barrels read SINGULARITY_WORKTREE at module init (e.g. database
  // pool guard). Set a dummy value so they don't throw during barrel import.
  process.env.SINGULARITY_WORKTREE ??= "barrel-import-stub";

  const noop = () => {};
  const identity = <T>(x: T): T => x;

  // Several server modules (database/server, database/admin, paths) throw at
  // top-level when this env var is missing. Setting a dummy value lets them
  // evaluate; pg.Pool connections are lazy so no real DB connect happens.
  process.env.SINGULARITY_WORKTREE ??= "__barrel_import_stub__";

  if (typeof globalThis.window === "undefined") {
    const loc = {
      protocol: "http:",
      host: "localhost",
      hostname: "localhost",
      port: "",
      pathname: "/",
      search: "",
      hash: "",
      href: "http://localhost/",
      origin: "http://localhost",
    };
    const fakeEl = () => ({ style: {}, setAttribute: noop, addEventListener: noop, appendChild: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
    (globalThis as any).window = {
      location: loc,
      addEventListener: noop,
      removeEventListener: noop,
      matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
      getComputedStyle: () => new Proxy({}, { get: () => "" }),
      requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
      cancelAnimationFrame: noop,
      innerWidth: 1280,
      innerHeight: 800,
      navigator: { userAgent: "stub" },
    };
    (globalThis as any).document = {
      createElement: fakeEl,
      createElementNS: fakeEl,
      createTextNode: () => ({}),
      addEventListener: noop,
      removeEventListener: noop,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      documentElement: { style: {}, classList: { add: noop, remove: noop } },
      body: { style: {}, appendChild: noop },
      head: { appendChild: noop },
    };
    (globalThis as any).MutationObserver = class { observe = noop; disconnect = noop; takeRecords = () => []; };
    (globalThis as any).ResizeObserver = class { observe = noop; disconnect = noop; unobserve = noop; };
    (globalThis as any).IntersectionObserver = class { observe = noop; disconnect = noop; unobserve = noop; };
  }

  const reactExports = {
    createElement: () => null,
    cloneElement: () => null,
    createContext: (defaultValue?: unknown) => ({
      Provider: noop,
      Consumer: noop,
      displayName: "",
      _currentValue: defaultValue,
    }),
    useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, noop],
    useEffect: noop,
    useLayoutEffect: noop,
    useMemo: (fn: () => unknown) => fn(),
    useCallback: identity,
    useRef: (init: unknown) => ({ current: init }),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ctx is untyped at runtime
    useContext: (ctx: { _currentValue?: unknown }) => ctx?._currentValue,
    useReducer: (_r: unknown, init: unknown) => [init, noop],
    useId: () => "stub",
    useSyncExternalStore: (_sub: unknown, getSnapshot: () => unknown) => getSnapshot(),
    forwardRef: (c: unknown) => c,
    memo: (c: unknown) => c,
    Fragment: Symbol.for("react.fragment"),
    Children: {
      map: (_c: unknown, fn: unknown) => (Array.isArray(_c) ? _c.map(fn as never) : []),
      forEach: noop,
      count: (c: unknown) => (Array.isArray(c) ? c.length : 0),
      only: identity,
      toArray: (c: unknown) => (Array.isArray(c) ? c : []),
    },
    isValidElement: () => false,
    lazy: (load: unknown) => ({ $$typeof: Symbol.for("react.lazy"), _payload: load }),
    Suspense: noop,
    startTransition: (fn: () => void) => fn(),
    useTransition: () => [false, (fn: () => void) => fn()],
    useDeferredValue: identity,
    useImperativeHandle: noop,
    useDebugValue: noop,
    Component: class {},
    PureComponent: class {},
    version: "19.0.0-stub",
    __esModule: true,
    default: null as unknown,
  };
  reactExports.default = reactExports;

  const jsxExports = {
    jsx: () => null,
    jsxs: () => null,
    jsxDEV: () => null,
    Fragment: reactExports.Fragment,
  };

  // Self-contained web-sdk stub — mirrors plugin-core's defineSlot/defineCommand
  // without importing real React.
  function defineSlot(id: string, opts?: { docLabel?: (props: any) => string | undefined }) {
    const slot = (props: any) => ({
      _slotId: id,
      _doc: { label: opts?.docLabel?.(props) },
      ...props,
    });
    slot.id = id;
    slot.useContributions = () => [];
    return slot;
  }

  function defineCommand(id: string) {
    const cmd = Object.assign(() => {}, {
      id,
      useHandler: noop,
    });
    return cmd;
  }

  const coreExports = {
    defineSlot,
    defineCommand,
    // Type-level seal only; at runtime the component is a plain ComponentType, so the
    // stub unseal is an identity passthrough (mirrors the real implementation).
    UNSAFE_unsealSlotComponent: (c: any) => c,
    Core: { Root: defineSlot("core.root") },
    PluginProvider: noop,
    PluginRuntimeContext: reactExports.createContext(null),
    loadPlugins: () => [],
    __esModule: true,
  };

  Bun.plugin({
    name: "barrel-import-stubs",
    setup(build) {
      // ── React family ───────────────────────────────────────────────
      build.module("react", () => ({
        exports: reactExports,
        loader: "object",
      }));
      build.module("react/jsx-runtime", () => ({
        exports: jsxExports,
        loader: "object",
      }));
      build.module("react/jsx-dev-runtime", () => ({
        exports: jsxExports,
        loader: "object",
      }));
      const reactDomExports = { createPortal: () => null, flushSync: (fn: () => void) => fn(), __esModule: true, default: null as unknown };
      reactDomExports.default = reactDomExports;
      build.module("react-dom", () => ({
        exports: reactDomExports,
        loader: "object",
      }));
      build.module("react-dom/client", () => ({
        exports: {
          createRoot: () => ({ render: noop, unmount: noop }),
          __esModule: true,
        },
        loader: "object",
      }));

      // ── @plugins/framework/plugins/web-sdk/core — self-contained, avoids importing real React ───────
      build.module("@plugins/framework/plugins/web-sdk/core", () => ({
        exports: coreExports,
        loader: "object",
      }));

      // ── Server plugin barrels that fail outside the real server ─────
      build.module("@plugins/database/server", () => ({
        exports: {
          db: {},
          awaitDbReady: () => Promise.resolve(),
          isTransientDbError: () => false,
          __esModule: true,
        },
        loader: "object",
      }));

      // ── Auto-generated stubs for npm packages ─────────────────────
      // Reads .d.ts entry points to discover named exports at build time.
      // To add a package: edit auto-stub-packages.ts and run ./singularity build.
      registerAutoStubs(build);

      // ── Manually-stubbed CSS subpath (package uses export *) ───────
      build.module("@xyflow/react/dist/style.css", () => ({
        exports: {},
        loader: "object",
      }));

      // ── CSS imports → empty ───────────────────────────────────────
      build.onLoad({ filter: /\.css$/ }, () => ({
        contents: "",
        loader: "js",
      }));
    },
  });
}

/**
 * Dynamically import a barrel file. Throws on failure so missing stubs
 * surface as build errors rather than silently omitting plugin metadata.
 * Requires `registerBarrelStubs()` to have been called first.
 */
export async function importBarrel(barrelPath: string): Promise<Record<string, unknown>> {
  try {
    return (await import(barrelPath)) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[barrel-import] Failed to import ${barrelPath}: ${msg}`);
  }
}
