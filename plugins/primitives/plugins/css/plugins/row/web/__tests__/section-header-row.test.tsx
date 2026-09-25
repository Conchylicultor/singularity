import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SectionHeaderRow } from "../internal/section-header-row";

afterEach(cleanup);

/** The chevron is the one `<svg>` the header draws itself. */
function chevronOf(el: HTMLElement): SVGElement {
  const svg = el.querySelector("svg");
  if (!svg) throw new Error("no chevron");
  return svg;
}

describe("SectionHeaderRow — disclosure", () => {
  it("leads with the chevron by default, always visible", () => {
    render(
      <SectionHeaderRow open onClick={() => {}}>
        Queue
      </SectionHeaderRow>,
    );
    const button = screen.getByRole("button", { name: "Queue" });
    const chevron = chevronOf(button);
    // Before the label: the first child of the control.
    expect(button.firstElementChild).toBe(chevron);
    expect(chevron.getAttribute("class")).not.toContain("opacity-0");
  });

  it("trailing: puts the chevron after the label, hidden at rest", () => {
    const onClick = vi.fn();
    render(
      <SectionHeaderRow open={false} onClick={onClick} disclosure="trailing">
        <span>Queue</span>
        <span>6</span>
      </SectionHeaderRow>,
    );
    const button = screen.getByRole("button", { name: "Queue6" });
    const chevron = chevronOf(button);
    // After the whole label run.
    expect(button.lastElementChild).toBe(chevron);
    expect(chevron.getAttribute("class")).toContain("opacity-0");
    expect(chevron.getAttribute("class")).toContain("pointer-events-none");
    // The disclosure semantics and the click target are unchanged.
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("trailing: reveals the chevron while the row is hovered", () => {
    render(
      <SectionHeaderRow open onClick={() => {}} disclosure="trailing">
        Queue
      </SectionHeaderRow>,
    );
    const button = screen.getByRole("button", { name: "Queue" });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerEnter(button);
    expect(chevronOf(button).getAttribute("class")).toContain("opacity-100");
    fireEvent.pointerLeave(button);
    expect(chevronOf(button).getAttribute("class")).toContain("opacity-0");
  });

  it("trailing: still calls a caller's own pointer handler", () => {
    const onPointerEnter = vi.fn();
    render(
      <SectionHeaderRow
        open
        onClick={() => {}}
        disclosure="trailing"
        onPointerEnter={onPointerEnter}
      >
        Queue
      </SectionHeaderRow>,
    );
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Queue" }));
    expect(onPointerEnter).toHaveBeenCalledTimes(1);
  });
});
