import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { ToggleChip } from "../internal/toggle-chip";

afterEach(cleanup);

// The twin of `badge/web/__tests__/badge-ref.test.tsx`, and it lives HERE rather
// than beside it because a plugin may only be tested from inside itself:
// `toggle-chip` imports `badge`, so a ToggleChip case written in badge's tests
// would close a badge → toggle-chip → badge import cycle.
//
// What it pins is the relay. `ToggleChip` renders no host element of its own —
// it is a `<Badge>` — so its `ref` and its passthrough have to survive a hop
// through another primitive's bag and still arrive together, on Badge's shell
// rather than the truncating label span inside it.
describe("ToggleChip — `ref` and the bag survive the hop through Badge", () => {
  it("lands ref on the chip shell, not the truncation span", () => {
    const ref = createRef<HTMLElement>();
    const { container } = render(
      <ToggleChip active ref={ref}>
        label
      </ToggleChip>,
    );
    expect(ref.current).toBe(container.firstElementChild);
    // The default host is a <button> — the chip IS the control, so a caller
    // measuring it or anchoring a popover to it gets the clickable node.
    expect(ref.current!.tagName).toBe("BUTTON");
    // The shell CONTAINS the truncating label; it is not it.
    expect(ref.current!.querySelector(".truncate")).not.toBeNull();
    expect(ref.current!.className).not.toContain("truncate");
  });

  it("puts the passthrough on the node ref names", () => {
    const ref = createRef<HTMLElement>();
    render(
      <ToggleChip active ref={ref} data-testid="chip" id="chip-id">
        label
      </ToggleChip>,
    );
    expect(ref.current!.getAttribute("data-testid")).toBe("chip");
    expect(ref.current!.id).toBe("chip-id");
  });
});
