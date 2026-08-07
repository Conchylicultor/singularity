/**
 * Pure-logic tests for the toast ledger — no DOM, no renderer.
 *
 * The store is a `Set` of ids behind a `useSyncExternalStore` triple, and
 * everything load-bearing about it (identity keying, notification economy,
 * snapshot stability) is observable from `subscribe` / `getSnapshot` alone. The
 * mount-set semantics that use it — a toast body registering on mount and
 * retiring on unmount — are covered by the jsdom suite in `web/__tests__/`.
 */

import { describe, expect, it, mock } from "bun:test";

type Store = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
};

// `subscribe` and `getSnapshot` are module-private, and `useLiveToastCount` is
// the only thing that ever hands them out — it hands them to React. Stubbing
// `useSyncExternalStore` intercepts that one handoff, which keeps this a unit
// test of the store rather than a render test of a one-line hook.
//
// The real module is spread back in rather than replaced wholesale: `mock.module`
// writes to a process-global registry and `bun test` runs every file in one
// process, so a bare `{ useSyncExternalStore }` would hand any other suite that
// imports React at runtime a module with nothing else in it. Today none does
// (the one other bun:test touching React uses a type-only import, erased before
// it runs), which is exactly the kind of thing that stops being true silently.
let captured: Store | undefined;
const actualReact = await import("react");
void mock.module("react", () => ({
  ...actualReact,
  useSyncExternalStore: (subscribe: Store["subscribe"], getSnapshot: Store["getSnapshot"]) => {
    captured = { subscribe, getSnapshot };
    return getSnapshot();
  },
}));

// Imported after the mock is installed, and aliased off the `use…` prefix on
// purpose: the call below is a module-scope invocation, not a render, and
// `react-hooks/rules-of-hooks` would rightly reject it under its real name.
const {
  trackToast,
  untrackToast,
  useLiveToastCount: captureStore,
} = await import("./live-toasts");

captureStore();
if (!captured) {
  throw new Error("useLiveToastCount() did not call useSyncExternalStore — the stub missed it");
}
const { subscribe, getSnapshot } = captured;

/** Counts notifications for the span of one test. */
function listen(): { calls: () => number; stop: () => void } {
  let calls = 0;
  const unsubscribe = subscribe(() => {
    calls += 1;
  });
  return { calls: () => calls, stop: unsubscribe };
}

// The ledger is module-global (one toast stack per page) and deliberately has no
// `clear` any more, so each test uses its own ids and undoes its own writes.
// Assertions are relative to the count on entry for the same reason.
describe("the toast ledger", () => {
  it("records an id once, however many times it is tracked", () => {
    const notify = listen();
    const before = getSnapshot();

    trackToast("dup");
    trackToast("dup");

    // One entry: the ledger is keyed by id, not by call.
    expect(getSnapshot()).toBe(before + 1);
    // …and one notification. The second call changed nothing, so it must not
    // wake every subscriber. (React would bail out on the unchanged number
    // anyway; the point is that the store does not manufacture the wake-up.)
    expect(notify.calls()).toBe(1);

    // A SINGLE untrack clears it. This is the assertion a `count++ / count--`
    // "simplification" fails — a counter would stand at +1 here, which is
    // exactly the empty-corner-with-a-number bug this plugin has now fixed twice.
    untrackToast("dup");
    expect(getSnapshot()).toBe(before);

    notify.stop();
  });

  it("untracking an id the ledger never held notifies nobody", () => {
    const notify = listen();
    const before = getSnapshot();

    untrackToast("never-tracked");

    expect(getSnapshot()).toBe(before);
    expect(notify.calls()).toBe(0);

    notify.stop();
  });

  it("settles at one entry for StrictMode's track → untrack → track", () => {
    // React 19 double-invokes every effect in dev: create → destroy → create.
    // The toast body registers in an effect, so this exact sequence runs for
    // every toast on every mount and has to land on "one toast, one entry".
    // Keep the store a Set: with keyed identity the sequence is order- and
    // repetition-independent, which is what makes StrictMode a non-event.
    const before = getSnapshot();

    trackToast("strict");
    untrackToast("strict");
    trackToast("strict");

    expect(getSnapshot()).toBe(before + 1);

    // And the unmount that eventually follows returns it to where it started.
    untrackToast("strict");
    expect(getSnapshot()).toBe(before);
  });

  it("returns a stable primitive from getSnapshot between mutations", () => {
    // `useSyncExternalStore` compares snapshots by identity and re-reads on every
    // render: a snapshot recomputed per call (a fresh array of ids, an object)
    // never compares equal, so React re-renders forever and dev-warns "The result
    // of getSnapshot should be cached". A number cannot fail that. Reading is
    // also pure — it must not mutate the ledger it reports on.
    trackToast("stable");

    const first = getSnapshot();
    expect(typeof first).toBe("number");
    expect(getSnapshot()).toBe(first);
    expect(getSnapshot()).toBe(first);

    untrackToast("stable");
    expect(getSnapshot()).toBe(first - 1);
  });
});
