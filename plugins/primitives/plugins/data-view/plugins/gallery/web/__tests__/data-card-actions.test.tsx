import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DataCard } from "../components/data-card";

// The gallery is the one row-action surface the browser e2e cannot reach: no
// `defineItemActions` consumer ships a gallery view today, so there is nothing
// to point `row-actions/e2e/cluster-parity.ts` at. This test therefore asserts
// COMPOSITION only — that `DataCard` routes its `actions` through the shared
// `RowActions` primitive rather than re-implementing a reveal — by reading the
// classes the primitive puts on the node it owns. It does not (and in jsdom
// cannot) prove the reveal actually happens on hover; that is the e2e's job on
// the surfaces where one exists.

afterEach(cleanup);

describe("gallery DataCard actions", () => {
  it("renders actions through RowActions (coupled reveal on the cluster's own node)", () => {
    const { getByTestId } = render(
      <DataCard actions={<button data-testid="action">act</button>}>
        body
      </DataCard>,
    );

    // The reveal rides the OUTERMOST node the primitive renders — the masked
    // Pin — so walk up from the action, not down from the card.
    const revealed = getByTestId("action").closest(".group-hover\\/row-actions\\:opacity-100");
    expect(revealed).not.toBeNull();

    const cls = revealed!.className;
    // Hidden at rest is BOTH, never opacity alone: an invisible cluster must not
    // stay a live click-target over the card body.
    expect(cls).toContain("opacity-0");
    expect(cls).toContain("pointer-events-none");
    // Hover is keyed on the primitive's private group, not a shared
    // hover-reveal group.
    expect(cls).toContain("group-hover/row-actions:opacity-100");
    expect(cls).toContain("group-hover/row-actions:pointer-events-auto");
    // Focus is asked about the CLUSTER's own subtree (`:has()` matches
    // descendants only) and only about keyboard focus, so tabbing to an action
    // reveals it while clicking anything in the card body does not.
    expect(cls).toContain("has-[:focus-visible]:opacity-100");
    expect(cls).toContain("has-[:focus-visible]:pointer-events-auto");
    // The regression this test now exists to catch: a row-scoped focus reveal
    // pinned the cluster open after any click inside the card.
    expect(cls).not.toContain("group-focus-within");
  });

  it("anchors the reveal on the card itself", () => {
    const { container } = render(
      <DataCard actions={<button>act</button>}>body</DataCard>,
    );

    const card = container.firstElementChild!;
    expect(card.className).toContain("group/row-actions");
  });

  it("renders no cluster at all when there are no actions", () => {
    const { container } = render(<DataCard>body</DataCard>);
    expect(
      container.querySelector(".group-hover\\/row-actions\\:opacity-100"),
    ).toBeNull();
  });
});
