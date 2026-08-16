import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useEffect, useState, type ReactElement } from "react";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";

/**
 * Does `ViewportOverlay active={false}` keep its subtree alive?
 *
 * It is documented as the keep-alive seam, and the per-tab solo placement
 * relies on that claim (`surface-body.tsx`: *"`createPortal` only moves the DOM
 * node — the React tree position is unchanged, so `TabSurface` keeps its state
 * across the transition"*). This primitive would have been built on it, so it
 * is worth an answer rather than an assumption.
 *
 * The reconciler rule says the claim is wrong: React reconciles a portal by
 * IDENTITY — `reconcileSinglePortal` reuses the existing fiber only when the
 * current child is already a `HostPortal` with the same `containerInfo`. Toggling
 * `active` swaps a plain host element for a portal at the same position, which
 * deletes the subtree and creates a new one.
 *
 * This probe settles it. If it ever starts passing as keep-alive, this file is
 * where the good news lands — and the primitive still would not build on it,
 * because a stable portal container is the mechanism that holds regardless.
 */

let mounts = 0;
let unmounts = 0;

function StatefulProbe(): ReactElement {
  const [minted] = useState(() => `instance-${String(mounts + 1)}`);
  useEffect(() => {
    mounts += 1;
    return () => {
      unmounts += 1;
    };
  }, []);
  return <span data-probe={minted}>probe</span>;
}

afterEach(cleanup);

describe("ViewportOverlay active={false} — the keep-alive claim", () => {
  it("REMOUNTS its subtree when `active` flips, so it is not a keep-alive seam", () => {
    mounts = 0;
    unmounts = 0;

    function Host({ active }: { active: boolean }): ReactElement {
      return (
        <ViewportOverlay active={active}>
          <StatefulProbe />
        </ViewportOverlay>
      );
    }

    const { rerender } = render(<Host active={true} />);
    expect(mounts).toBe(1);
    const first = document
      .querySelector("[data-probe]")
      ?.getAttribute("data-probe");

    rerender(<Host active={false} />);

    // The observed answer, recorded rather than asserted from theory: flipping
    // `active` tears the subtree down and builds a new one, so any state held
    // inside it (a scroll position, an in-flight drag, a Web Audio node) is
    // lost. Filed separately as a pre-existing bug in the solo-placement path.
    expect(unmounts).toBe(1);
    expect(mounts).toBe(2);
    expect(
      document.querySelector("[data-probe]")?.getAttribute("data-probe"),
    ).not.toBe(first);
  });
});
