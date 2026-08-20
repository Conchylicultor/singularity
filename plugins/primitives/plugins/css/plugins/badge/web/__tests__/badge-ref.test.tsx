import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { Badge } from "../internal/badge";

afterEach(cleanup);

// A badge renders TWO host elements: the chip shell, and the `truncate` span
// that ellipsizes a long label inside it. So "where does `ref` land" is a real
// question here rather than a formality — and the answer has to be the SHELL,
// the node a caller's `data-*` also lands on. Badge declared no `ref` at all
// before the passthrough contract; it was flowing untyped through the anonymous
// index signature, which is exactly what made the destination unstated.
//
// `ToggleChip`, which relays its bag through this same shell, is pinned from its
// own plugin (`toggle-chip/web/__tests__/`) — testing it from here would close a
// badge → toggle-chip → badge import cycle.
describe("Badge — `ref` lands on the chip shell", () => {
  it("gives Badge's ref the outer element, not the truncation span", () => {
    const ref = createRef<HTMLElement>();
    const { container } = render(<Badge ref={ref}>label</Badge>);
    expect(ref.current).toBe(container.firstElementChild);
    // The shell CONTAINS the truncation span; it is not it.
    expect(ref.current!.className).toContain("inline-flex");
    expect(ref.current!.querySelector(".truncate")).not.toBeNull();
    expect(ref.current!.className).not.toContain("truncate");
  });

  it("lands on the host `as` names", () => {
    const ref = createRef<HTMLElement>();
    render(
      <Badge as="button" ref={ref}>
        label
      </Badge>,
    );
    expect(ref.current!.tagName).toBe("BUTTON");
  });

  // The passthrough's other half: the bag has to address the SAME node `ref`
  // names. Asserting both on one render is what pins them together — a future
  // wrapper element that takes one and leaves the other fails here.
  it("puts the passthrough on the node ref names", () => {
    const ref = createRef<HTMLElement>();
    render(
      <Badge ref={ref} data-testid="chip" id="chip-id">
        label
      </Badge>,
    );
    expect(ref.current!.getAttribute("data-testid")).toBe("chip");
    expect(ref.current!.id).toBe("chip-id");
  });
});
