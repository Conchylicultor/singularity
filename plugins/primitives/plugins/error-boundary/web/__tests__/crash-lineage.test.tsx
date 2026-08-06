import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { PluginProvider } from "@plugins/framework/plugins/web-sdk/core";
import { UiRegion } from "@plugins/primitives/plugins/ui-context/web";
import type { UiContextMeta } from "@plugins/primitives/plugins/ui-context/core";
import { PluginErrorBoundary } from "../components/plugin-error-boundary";
import { boundaryReportSink, type BoundaryErrorReport } from "../reporter";

// Pins the load-bearing claim of the crash-lineage change: the fallback renders
// in the crashed subtree's own position, so a walk from ITS root recovers the
// screen region the throwing subtree occupied — which is the whole reason the
// lineage is collected at the fallback rather than at either boundary class
// (both construct their report before anything is mounted).
//
// The region half is asserted because it is the unconditional one: <UiRegion> is
// always on, while contribution nodes come from an opt-in middleware living in
// improve/element-picker, which error-boundary must not depend on.

function Boom(): never {
  throw new Error("boom");
}

// React logs caught boundary errors to console.error; that is expected noise.
const consoleError = console.error;
afterEach(() => {
  cleanup();
  boundaryReportSink.register(null);
  console.error = consoleError;
});

describe("CrashFallback lineage", () => {
  it("reports the region the crashed subtree occupied", async () => {
    console.error = () => {};
    const reports: BoundaryErrorReport[] = [];
    boundaryReportSink.register((r) => {
      reports.push(r);
    });

    render(
      <PluginProvider plugins={[]}>
        <UiRegion kind="pane" id="p1" label="column 1 of 1">
          <PluginErrorBoundary slot="X">
            <Boom />
          </PluginErrorBoundary>
        </UiRegion>
      </PluginProvider>,
    );

    // The fallback defers its emit one tick so a late-registering reporter is
    // still reached, so the report lands asynchronously.
    await waitFor(() => expect(reports.length).toBeGreaterThan(0));

    // Exactly once, despite a catch rendering the boundary TWICE
    // (getDerivedStateFromError, then componentDidCatch's setState) with a fresh
    // `report` object each time — which re-runs the effect. The second render
    // lands in the commit phase, before the deferred emit's macrotask fires, so
    // the cleanup's clearTimeout cancels the first and only the second (the one
    // carrying componentStack) reaches the sink. Drop the deferral or the
    // clearTimeout and every crash double-counts its report `count`.
    expect(reports.length).toBe(1);

    const uiContext = reports[0]!.uiContext as UiContextMeta;
    expect(uiContext.path).toContain("#pane:p1[column 1 of 1]");
    // The label is the boundary's own tag — for an overlay crash it is the
    // overlay `kind`, which is what keeps that string earning its place.
    expect(uiContext.element).toBe("X");
  });
});
