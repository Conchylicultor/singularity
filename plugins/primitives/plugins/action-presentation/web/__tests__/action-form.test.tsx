import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import {
  ActionFormProvider,
  useActionForm,
  useHoldShrink,
  type ActionForm,
  type ItemFormChannel,
  type ShrinkLadder,
} from "../index";

/**
 * The two invariants this seam exists for:
 *
 * 1. A widget is only ever asked for a form it offered — enforced here, not
 *    trusted of the region, and holding even on the commit before the
 *    declaration has reached the region.
 * 2. With no region above, the whole thing is a constant `"full"` and a no-op,
 *    because ~90 plugins render an `IconButton` in ordinary chrome.
 */

/** A stand-in region: records what its item declared and held. */
function makeChannel(form: ActionForm) {
  const declare = vi.fn<(ladder: Required<ShrinkLadder>) => () => void>();
  const release = vi.fn();
  declare.mockImplementation(() => release);
  const hold = vi.fn<() => () => void>();
  const holdRelease = vi.fn();
  hold.mockImplementation(() => holdRelease);
  const channel: ItemFormChannel = { form, declare, hold };
  return { channel, declare, release, hold, holdRelease };
}

/** Renders the form it was assigned as text, and records every rendered value. */
function Widget({
  ladder,
  seen,
}: {
  ladder?: ShrinkLadder;
  seen?: ActionForm[];
}) {
  const form = useActionForm(ladder);
  seen?.push(form);
  return <span data-testid="form">{form}</span>;
}

function Region({
  channel,
  children,
}: {
  channel: ItemFormChannel;
  children: ReactNode;
}) {
  return <ActionFormProvider channel={channel}>{children}</ActionFormProvider>;
}

afterEach(cleanup);

describe("useActionForm — the assignment", () => {
  it("returns the assigned form when the caller declared that rung", () => {
    const { channel } = makeChannel("row");
    const { getByTestId } = render(
      <Region channel={channel}>
        <Widget ladder={{ shrinksTo: ["row"] }} />
      </Region>,
    );
    expect(getByTestId("form").textContent).toBe("row");
  });

  it("refuses a form the caller never declared", () => {
    // The jog-wheel case: a region that hands `"row"` to a widget offering only
    // `"compact"` gets `"full"` back — the transform is unrepresentable, not
    // merely discouraged.
    const { channel } = makeChannel("row");
    const { getByTestId } = render(
      <Region channel={channel}>
        <Widget ladder={{ shrinksTo: ["compact"] }} />
      </Region>,
    );
    expect(getByTestId("form").textContent).toBe("full");
  });

  it("refuses every non-full form when the caller declared no rungs", () => {
    const { channel } = makeChannel("compact");
    const { getByTestId } = render(
      <Region channel={channel}>
        <Widget />
      </Region>,
    );
    expect(getByTestId("form").textContent).toBe("full");
  });

  it("holds the invariant on the first commit, before the declaration lands", () => {
    // A region whose assignment is already `"row"` on the very first render:
    // the widget's declaration is still only queued in an effect, so the value
    // it renders WITH must already be filtered.
    const { channel } = makeChannel("row");
    const seen: ActionForm[] = [];
    render(
      <Region channel={channel}>
        <Widget ladder={{ shrinksTo: ["compact"] }} seen={seen} />
      </Region>,
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((form) => form === "full")).toBe(true);
  });
});

describe("useActionForm — no region above", () => {
  it("is a constant full and declares nothing", () => {
    const { getByTestId } = render(<Widget ladder={{ shrinksTo: ["row"] }} />);
    expect(getByTestId("form").textContent).toBe("full");
  });

  it("survives a re-render and an unmount with no provider", () => {
    const { unmount, rerender } = render(<Widget />);
    expect(() => {
      rerender(<Widget ladder={{ yields: "early" }} />);
      unmount();
    }).not.toThrow();
  });
});

describe("useActionForm — the declaration", () => {
  it("normalizes an absent ladder to no rungs and normal eagerness", () => {
    const { channel, declare } = makeChannel("full");
    render(
      <Region channel={channel}>
        <Widget />
      </Region>,
    );
    expect(declare).toHaveBeenCalledTimes(1);
    expect(declare).toHaveBeenCalledWith({ shrinksTo: [], yields: "normal" });
  });

  it("does not re-declare when a fresh literal carries the same value", () => {
    // Every call site passes an object literal inline, so identity churns on
    // every render. Re-registering each time would make the region's ledger
    // thrash on any unrelated parent re-render.
    const { channel, declare, release } = makeChannel("full");
    const { rerender } = render(
      <Region channel={channel}>
        <Widget ladder={{ shrinksTo: ["row"], yields: "late" }} />
      </Region>,
    );
    expect(declare).toHaveBeenCalledTimes(1);

    rerender(
      <Region channel={channel}>
        <Widget ladder={{ shrinksTo: ["row"], yields: "late" }} />
      </Region>,
    );
    expect(declare).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it("re-declares when the ladder's value changes", () => {
    // Eagerness is per-instance and dynamic — every tab is the same component,
    // and only the focused one says `"never"`.
    const { channel, declare, release } = makeChannel("full");
    const { rerender } = render(
      <Region channel={channel}>
        <Widget ladder={{ shrinksTo: ["compact"], yields: "normal" }} />
      </Region>,
    );
    expect(declare).toHaveBeenCalledTimes(1);

    rerender(
      <Region channel={channel}>
        <Widget ladder={{ shrinksTo: ["compact"], yields: "never" }} />
      </Region>,
    );
    expect(release).toHaveBeenCalledTimes(1);
    expect(declare).toHaveBeenCalledTimes(2);
    expect(declare).toHaveBeenLastCalledWith({
      shrinksTo: ["compact"],
      yields: "never",
    });
  });

  it("releases its rung when the widget leaves the tree", () => {
    const { channel, release } = makeChannel("full");
    const { rerender } = render(
      <Region channel={channel}>
        <Widget ladder={{ shrinksTo: ["row"] }} />
      </Region>,
    );
    expect(release).not.toHaveBeenCalled();

    rerender(<Region channel={channel}>{null}</Region>);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("useHoldShrink", () => {
  function Holder({ active }: { active: boolean }) {
    useHoldShrink(active);
    return null;
  }

  it("acquires while active and releases when it stops", () => {
    const { channel, hold, holdRelease } = makeChannel("full");
    const { rerender } = render(
      <Region channel={channel}>
        <Holder active={false} />
      </Region>,
    );
    expect(hold).not.toHaveBeenCalled();

    rerender(
      <Region channel={channel}>
        <Holder active={true} />
      </Region>,
    );
    expect(hold).toHaveBeenCalledTimes(1);
    expect(holdRelease).not.toHaveBeenCalled();

    rerender(
      <Region channel={channel}>
        <Holder active={false} />
      </Region>,
    );
    expect(holdRelease).toHaveBeenCalledTimes(1);
  });

  it("releases a still-active hold on unmount", () => {
    // A fling that unmounts mid-coast must not pin the item forever.
    const { channel, holdRelease } = makeChannel("full");
    const { unmount } = render(
      <Region channel={channel}>
        <Holder active={true} />
      </Region>,
    );
    unmount();
    expect(holdRelease).toHaveBeenCalledTimes(1);
  });

  it("is a no-op with no region above", () => {
    function Standalone() {
      const [active, setActive] = useState(true);
      useHoldShrink(active);
      return (
        <button type="button" onClick={() => setActive(false)}>
          stop
        </button>
      );
    }
    const { getByRole } = render(<Standalone />);
    expect(() => getByRole("button").click()).not.toThrow();
  });
});
