import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Installed sinks — the slot a HIGHER layer fills and a LOWER layer calls.
//
// `apps-core/tabs` imports `primitives/pane`, so the pane cannot import tabs
// back to reach the cross-app navigator. The codebase's answer is a module-level
// slot: the pane declares it, tabs installs an implementation into it at
// provider mount, and the pane calls it without knowing tabs exists. The history
// adapter, the overlay-boundary fallback and the live-store pointer are all this
// same shape.
//
// THE BUG THIS EXISTS TO KILL. Installation is LATE — it happens in an effect,
// one commit after the first render of everything mounting alongside it. A
// render-path read is a ONE-SHOT SAMPLE — a `useMemo`, a `useState` initializer
// or a bare call in a component body captures the answer once, and the sink is
// in nobody's dependency array, so nothing re-runs. Put the two together and
// whichever answer you got is mount-order luck, cached for the life of the
// component. That is exactly how the pane's Expand button broke: it asked
// `canNavigateApp()` from inside a `useMemo`, a pane mounting in the same commit
// as `TabsProvider` was told "nowhere to go", and the button never appeared
// again. Panes in the deferred plugin tier happened to mount after the effect
// and worked, so the failure was invisible and looked like a per-pane bug.
//
// The fix is that a render path has no non-reactive spelling of the presence
// question. `useInstalled()` is the ONLY presence answer this primitive offers,
// and it is subscribed, so a late install re-renders whoever asked early.
//
// WHY THE IMPERATIVE READ IS CALLED `peek`. Sampling the slot is legitimate from
// an event handler or an effect — both run after installation and re-run on
// every invocation. It is only wrong during render. No type can carry "not
// during render", so the invariant lands on lint (rung 3 of the structural-fix
// ladder), and lint can only recognise a sample if every sample has one shape
// and one name. `sink.peek()` / `sink.peekOrThrow()` are that name:
// `install-sink/no-render-phase-peek` keys on it. A free `canNavigateApp()` was
// indistinguishable from `getUserName()`; `peek…` is not. Do not rename these
// members at a call site, and do not wrap one in a differently-named getter —
// `install-sink/no-laundered-peek` catches that hop.
//
// Design: research/2026-08-17-global-installed-sink-render-read.md
// Write-side twin: `primitives/report-sink` (a slot you EMIT into).
// ---------------------------------------------------------------------------

export interface InstallSinkOptions {
  /** Stable identity used in error messages, e.g. "pane.app-nav". */
  name: string;
  /** Human phrase for the throw message, e.g. "the cross-app navigator (installed by apps-core/tabs at provider mount)". */
  what: string;
}

export interface InstallSink<T> {
  readonly name: string;
  /** Install an implementation. Returns a disposer restoring the PREVIOUS occupant. */
  install(value: T): () => void;
  /** Reactive read. */
  useValue(): T | null;
  /** Reactive presence — the ONLY presence answer available to a render path. */
  useInstalled(): boolean;
  /** One-shot sample. Event handlers and effects ONLY (lint-enforced). */
  peek(): T | null;
  /** One-shot sample that throws, naming the sink, when nothing is installed. */
  peekOrThrow(): T;
}

/** A sink with a fallback is never absent, so it has no presence question. */
export interface FilledInstallSink<T> {
  readonly name: string;
  install(value: T): () => void;
  useValue(): T;
  peek(): T;
}

export function defineInstallSink<T>(
  opts: InstallSinkOptions & { fallback: T },
): FilledInstallSink<T>;
export function defineInstallSink<T>(opts: InstallSinkOptions): InstallSink<T>;
export function defineInstallSink<T>(
  opts: InstallSinkOptions & { fallback?: T },
): InstallSink<T> | FilledInstallSink<T> {
  const { name, what } = opts;
  // A sink declared with a fallback is never empty: `initial` is what the slot
  // holds before anyone installs, and what the last disposer restores.
  const initial: T | null = "fallback" in opts ? (opts.fallback as T) : null;
  const initialInstalled = initial !== null;

  // The one mutable slot. It lives in the FACTORY closure, not at module scope,
  // so each sink owns its own and `scoped-store/no-module-mutable-store` (which
  // keys on a module-scope `let` read by a `useSyncExternalStore` snapshot) has
  // nothing to flag. Process-global is the point here — a sink names ONE
  // implementation for the whole page, unlike per-surface state.
  let current: T | null = initial;
  const subscribers = new Set<() => void>();

  // ONE stable subscribe + snapshot triple, created here rather than per render,
  // so `useSyncExternalStore` never resubscribes on a re-render.
  const subscribe = (notify: () => void): (() => void) => {
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  };
  const readValue = (): T | null => current;
  const readInstalled = (): boolean => current !== null;
  const serverValue = (): T | null => initial;
  const serverInstalled = (): boolean => initialInstalled;

  /** Move the slot. Bails on an `Object.is`-equal write, so nobody re-renders for a no-op. */
  function write(next: T | null): void {
    if (Object.is(current, next)) return;
    current = next;
    for (const notify of subscribers) notify();
  }

  function install(value: T): () => void {
    const previous = current;
    write(value);
    return () => {
      // Restore ONLY if this install is still the sitting occupant. A disposer
      // whose value was already superseded is a silent no-op: React StrictMode
      // double-mounts an effect (install A, install A', dispose A) and a
      // provider swap installs the new implementation before tearing the old
      // one down. Restoring blindly would let an earlier teardown clobber a
      // later install, emptying a slot that someone had just filled.
      if (!Object.is(current, value)) return;
      write(previous);
    };
  }

  function useValue(): T | null {
    return useSyncExternalStore(subscribe, readValue, serverValue);
  }

  function useInstalled(): boolean {
    return useSyncExternalStore(subscribe, readInstalled, serverInstalled);
  }

  function peek(): T | null {
    return current;
  }

  function peekOrThrow(): T {
    if (current === null) {
      throw new Error(
        `install-sink "${name}": nothing is installed — ${what} was never installed in this composition, so there is nobody to call.`,
      );
    }
    return current;
  }

  return { name, install, useValue, useInstalled, peek, peekOrThrow };
}
