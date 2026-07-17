import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useState, type ReactNode } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { Expandable } from "@plugins/primitives/plugins/expandable/web";

// jsdom reports offsetHeight as 0, so stub a tall content box to engage the clamp
// and render the toggle. (The no-op ResizeObserver the overflow detection also
// needs comes from the shared `test/setup.ts` — the one synchronous recompute() in
// the layout effect is enough to decide overflow under it.)
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 1000;
    },
  });
});

afterEach(cleanup);

const TALL = "x\n".repeat(50);

describe("Expandable controlled mode", () => {
  it("renders the controlled value and never tracks its own", () => {
    const { rerender } = render(<Expandable expanded={false}>{TALL}</Expandable>);
    expect(screen.getByRole("button").textContent).toContain("Show more");

    // A controlled instance ignores its own click for rendering — only the prop
    // moves it. (onToggle is what the owner would wire to its setter.)
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toContain("Show more");

    rerender(<Expandable expanded={true}>{TALL}</Expandable>);
    expect(screen.getByRole("button").textContent).toContain("Show less");
  });

  it("reports the next state via onToggle", () => {
    const seen: boolean[] = [];
    render(
      <Expandable expanded={false} onToggle={(v) => seen.push(v)}>
        {TALL}
      </Expandable>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(seen).toEqual([true]);
  });
});

// Reproduces the StickyUserHeader wiring that caused the original double-click
// bug: a single owner holds `expanded`, feeds it to a controlled Expandable, AND
// swaps the wrapper element type (Sticky <div> vs static <section>) when it
// flips — which remounts the subtree. With the state owned by the parent (not
// mirrored inside Expandable), one click both expands and re-chromes; the
// remount can no longer wipe the expansion.
function StickyLikeOwner({ children }: { children: (expanded: boolean) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const inner = (
    <Expandable expanded={expanded} onToggle={setExpanded}>
      {children(expanded)}
    </Expandable>
  );
  // Different element types per branch => React remounts `inner` on toggle.
  return expanded ? <div data-static>{inner}</div> : <section data-sticky>{inner}</section>;
}

describe("single-owner expansion survives a wrapper remount", () => {
  it("expands on the first click even though the wrapper element type changes", () => {
    render(<StickyLikeOwner>{() => TALL}</StickyLikeOwner>);

    // Collapsed + sticky to start.
    expect(document.querySelector("[data-sticky]")).not.toBeNull();
    expect(document.querySelector("[data-static]")).toBeNull();
    expect(screen.getByRole("button").textContent).toContain("Show more");

    fireEvent.click(screen.getByRole("button"));

    // One click: expanded AND non-sticky, despite the remount.
    expect(screen.getByRole("button").textContent).toContain("Show less");
    expect(document.querySelector("[data-static]")).not.toBeNull();
    expect(document.querySelector("[data-sticky]")).toBeNull();
  });
});
