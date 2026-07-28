import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { Pane, PaneResolveGuard, type PaneStore } from "@plugins/primitives/plugins/pane/web";
import { createTestSurfaceStore, TestSurface } from "./surface-fixture";

// Regression: a resolve hook whose live-state resource flips transiently back to
// `pending` (e.g. an HTTP-fallback refetch failing under memory pressure) must
// NOT unmount the resolved pane — that would destroy scroll/focus/unsaved draft.
// The guard is sticky-found: once resolved for an identity it stays mounted
// through later `pending` flips, and only a SETTLED miss downgrades to Not Found.

// A mutable resolve result the test drives frame-by-frame. Every guard render
// reads the current value, so re-rendering after mutating it exercises a flip.
let resolveResult: { pending: boolean; found: boolean } = { pending: true, found: false };

// A real defined pane: `Pane.define` registers it in the internal→object map
// that the Not-Found fallback chrome (`paneObjectFor`) consults. `resolve` reads
// the module-level `resolveResult`, so the test owns the resolve outcome.
const testPane = Pane.define({
  id: "sticky-guard-test",
  segment: "sticky/:id",
  resolve: () => resolveResult,
  component: () => <div data-testid="pane-body">resolved</div>,
});

// The guard's Loading / Not-Found chrome calls `useClose()` / `usePromote()`,
// which read the surface's pane store — so the guard must be mounted in a
// surface, not bare. A background store keeps this suite off the URL entirely:
// it drives the resolve hook directly and has no route to derive. With an empty
// route both hooks return null, so no promote/close button renders.
let store: PaneStore;

beforeEach(() => {
  store = createTestSurfaceStore({ live: false });
});

afterEach(() => {
  cleanup();
  resolveResult = { pending: true, found: false };
});

/** Mount the guard for `id` in a surface. Returned so a case can re-render it. */
function guard(id: string) {
  return (
    <TestSurface store={store}>
      <PaneResolveGuard pane={testPane._internal} params={{ id }} />
    </TestSurface>
  );
}

describe("sticky resolve guard", () => {
  it("keeps the pane mounted when a resolved resource flips back to pending", () => {
    resolveResult = { pending: false, found: true };
    const { getByTestId, queryByText, rerender } = render(guard("a"));
    expect(getByTestId("pane-body")).toBeTruthy();

    // Transient error: settled resource flips back to pending.
    resolveResult = { pending: true, found: false };
    rerender(guard("a"));

    // The pane body is still mounted; no Loading fallback swapped in.
    expect(getByTestId("pane-body")).toBeTruthy();
    expect(queryByText("Loading…")).toBeNull();
  });

  it("downgrades to Not Found on a settled miss even after it was found (real deletion)", () => {
    resolveResult = { pending: false, found: true };
    const { getByTestId, queryByTestId, getByText, rerender } = render(guard("a"));
    expect(getByTestId("pane-body")).toBeTruthy();

    // The resource settles with the row gone — a genuine deletion.
    resolveResult = { pending: false, found: false };
    rerender(guard("a"));

    expect(queryByTestId("pane-body")).toBeNull();
    expect(getByText("Not Found")).toBeTruthy();
  });

  it("resets stickiness when params change (a swap re-roots the pane in place)", () => {
    // Resolve task "a".
    resolveResult = { pending: false, found: true };
    const { getByTestId, queryByTestId, getAllByText, queryByText, rerender } = render(guard("a"));
    expect(getByTestId("pane-body")).toBeTruthy();

    // Swap to task "b" while its resource is still loading. Stickiness from "a"
    // must NOT leak: the guard shows Loading for the new, unresolved identity.
    resolveResult = { pending: true, found: false };
    rerender(guard("b"));

    expect(queryByTestId("pane-body")).toBeNull();
    expect(queryByText("Not Found")).toBeNull();
    // "Loading…" appears both as the fallback title and inside <Loading/>.
    expect(getAllByText("Loading…").length).toBeGreaterThan(0);
  });
});
