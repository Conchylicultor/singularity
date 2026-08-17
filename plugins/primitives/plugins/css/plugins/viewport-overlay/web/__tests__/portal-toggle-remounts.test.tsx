import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createPortal } from "react-dom";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";

/**
 * Does turning a portal on and off keep the subtree underneath it alive?
 *
 * No. React reconciles a portal by the IDENTITY OF ITS CONTAINER —
 * `reconcileSinglePortal` reuses the existing fiber only when the current child
 * is already a `HostPortal` with the same `containerInfo`. So both of these
 * delete the subtree and build a new one:
 *
 *   cond ? createPortal(children, document.body) : <>{children}</>   // element kind changes
 *   createPortal(children, cond ? a : b)                             // container changes
 *
 * This file measures the shape rather than any one component's prop, because
 * that is the durable lesson: `ViewportOverlay` once carried an `active` prop
 * documented as "the extension point for keep-alive toggles", and
 * `apps-core/surface` shipped the ternary spelling on the strength of that
 * claim. Both are gone; the measurement stays so nobody re-derives it.
 *
 * What to do when you actually need keep-alive, neither of which is a branch:
 *
 * - Stop moving the subtree — remove whatever made the portal necessary. A
 *   `fixed` box only needs the portal because some ancestor is its containing
 *   block, so drop the ancestor's `transform` / `filter` / `will-change`
 *   instead (`plugins/apps-core/plugins/surface`).
 * - Or mint ONE stable container per occupant, always portal into it, and
 *   re-parent that container imperatively — a DOM move React never sees. That
 *   is `plugins/primitives/plugins/adaptive-bar`, whose CLAUDE.md documents the
 *   mechanism under "Why one stable container per item" along with everything a
 *   re-parent costs (an `<iframe>` reloads, focus and pointer capture are lost).
 *
 * The third test is the positive control: an UNCONDITIONAL `<ViewportOverlay>`
 * does keep its subtree across a rerender, because `document.body` is a stable
 * container. The portal is not the problem — the toggle is.
 */

let mounts = 0;
let unmounts = 0;
let minted = 0;

/** Reports its own mount/unmount and carries an id no remount can reproduce. */
function StatefulProbe(): ReactElement {
  const [id] = useState(() => {
    minted += 1;
    return `instance-${String(minted)}`;
  });
  useEffect(() => {
    mounts += 1;
    return () => {
      unmounts += 1;
    };
  }, []);
  return <span data-probe={id}>probe</span>;
}

function probeId(): string | null | undefined {
  return document.querySelector("[data-probe]")?.getAttribute("data-probe");
}

afterEach(() => {
  cleanup();
  mounts = 0;
  unmounts = 0;
  minted = 0;
});

describe("a portal toggle is not keep-alive", () => {
  it("REMOUNTS when a portal is switched on at a tree position", () => {
    // The shape `apps-core/surface` shipped: one tree slot holding a portal in
    // one state and a plain fragment in the other.
    function Toggling({
      portaled,
      children,
    }: {
      portaled: boolean;
      children: ReactNode;
    }): ReactElement {
      // The shape `no-portal-toggle` bans. It needs no disable comment: like
      // every contributed rule it is off in test files (NON_APP_FILE_GLOBS),
      // which is what lets this file keep a specimen of the mistake.
      return portaled ? createPortal(children, document.body) : <>{children}</>;
    }

    const { rerender } = render(
      <Toggling portaled={false}>
        <StatefulProbe />
      </Toggling>,
    );
    expect(mounts).toBe(1);
    const first = probeId();

    rerender(
      <Toggling portaled={true}>
        <StatefulProbe />
      </Toggling>,
    );

    expect(unmounts).toBe(1);
    expect(mounts).toBe(2);
    expect(probeId()).not.toBe(first);
  });

  it("REMOUNTS when a portal keeps its position but changes container", () => {
    // The same deletion by the other route: the element kind never changes, only
    // `containerInfo` does — which is precisely what the reconciler compares.
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);

    function Relocating({
      to,
      children,
    }: {
      to: HTMLElement;
      children: ReactNode;
    }): ReactElement {
      return createPortal(children, to);
    }

    const { rerender } = render(
      <Relocating to={first}>
        <StatefulProbe />
      </Relocating>,
    );
    expect(mounts).toBe(1);
    expect(first.querySelector("[data-probe]")).not.toBeNull();
    const firstId = probeId();

    rerender(
      <Relocating to={second}>
        <StatefulProbe />
      </Relocating>,
    );

    expect(unmounts).toBe(1);
    expect(mounts).toBe(2);
    expect(second.querySelector("[data-probe]")).not.toBeNull();
    expect(probeId()).not.toBe(firstId);

    first.remove();
    second.remove();
  });

  it("keeps ONE instance across a rerender when the overlay is unconditional", () => {
    // The control that keeps the first two honest: a portal per se retains its
    // subtree fine. `<ViewportOverlay>` always portals, always into
    // `document.body`, so the container identity never changes and the fiber is
    // reused — even as its own props change.
    function Host({ label }: { label: string }): ReactElement {
      return (
        <ViewportOverlay className={label}>
          <StatefulProbe />
        </ViewportOverlay>
      );
    }

    const { rerender } = render(<Host label="one" />);
    expect(mounts).toBe(1);
    const first = probeId();

    rerender(<Host label="two" />);

    expect(unmounts).toBe(0);
    expect(mounts).toBe(1);
    expect(probeId()).toBe(first);
  });
});
