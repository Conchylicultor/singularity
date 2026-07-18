import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { Pane, PaneResolveGuard } from "@plugins/primitives/plugins/pane/web";

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

afterEach(() => {
  cleanup();
  resolveResult = { pending: true, found: false };
});

describe("sticky resolve guard", () => {
  it("keeps the pane mounted when a resolved resource flips back to pending", () => {
    resolveResult = { pending: false, found: true };
    const { getByTestId, queryByText, rerender } = render(
      <PaneResolveGuard pane={testPane._internal} params={{ id: "a" }} />,
    );
    expect(getByTestId("pane-body")).toBeTruthy();

    // Transient error: settled resource flips back to pending.
    resolveResult = { pending: true, found: false };
    rerender(<PaneResolveGuard pane={testPane._internal} params={{ id: "a" }} />);

    // The pane body is still mounted; no Loading fallback swapped in.
    expect(getByTestId("pane-body")).toBeTruthy();
    expect(queryByText("Loading…")).toBeNull();
  });

  it("downgrades to Not Found on a settled miss even after it was found (real deletion)", () => {
    resolveResult = { pending: false, found: true };
    const { getByTestId, queryByTestId, getByText, rerender } = render(
      <PaneResolveGuard pane={testPane._internal} params={{ id: "a" }} />,
    );
    expect(getByTestId("pane-body")).toBeTruthy();

    // The resource settles with the row gone — a genuine deletion.
    resolveResult = { pending: false, found: false };
    rerender(<PaneResolveGuard pane={testPane._internal} params={{ id: "a" }} />);

    expect(queryByTestId("pane-body")).toBeNull();
    expect(getByText("Not Found")).toBeTruthy();
  });

  it("resets stickiness when params change (a swap re-roots the pane in place)", () => {
    // Resolve task "a".
    resolveResult = { pending: false, found: true };
    const { getByTestId, queryByTestId, getAllByText, queryByText, rerender } = render(
      <PaneResolveGuard pane={testPane._internal} params={{ id: "a" }} />,
    );
    expect(getByTestId("pane-body")).toBeTruthy();

    // Swap to task "b" while its resource is still loading. Stickiness from "a"
    // must NOT leak: the guard shows Loading for the new, unresolved identity.
    resolveResult = { pending: true, found: false };
    rerender(<PaneResolveGuard pane={testPane._internal} params={{ id: "b" }} />);

    expect(queryByTestId("pane-body")).toBeNull();
    expect(queryByText("Not Found")).toBeNull();
    // "Loading…" appears both as the fallback title and inside <Loading/>.
    expect(getAllByText("Loading…").length).toBeGreaterThan(0);
  });
});
