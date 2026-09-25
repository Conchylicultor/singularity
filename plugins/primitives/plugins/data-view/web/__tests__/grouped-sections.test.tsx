import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DataViewSection } from "../../core";
import { GroupedSections } from "../internal/grouped-sections";

afterEach(cleanup);

const SECTIONS = [
  { key: "queue", label: "Queue", count: 6, entries: [] },
  { key: "working", label: "Working", count: 2, entries: [] },
] as unknown as DataViewSection<unknown>[];

function renderSections(
  headerStyle?: "standard" | "quiet",
  headerActions?: (s: DataViewSection<unknown>) => ReactNode,
) {
  return render(
    <GroupedSections
      sections={SECTIONS}
      headerStyle={headerStyle}
      headerActions={headerActions}
    >
      {(section) => <div>rows of {section.key}</div>}
    </GroupedSections>,
  );
}

describe("GroupedSections — header style", () => {
  it("renders the identical node for an absent and a `standard` style", () => {
    // `useId` mints a fresh id per mount; everything else must match exactly.
    const html = (el: HTMLElement) => el.innerHTML.replace(/_r_\w+_/g, "_id_");
    const absent = html(renderSections().container);
    cleanup();
    const standard = html(renderSections("standard").container);
    expect(standard).toBe(absent);
  });

  it("standard: chevron leads, the count sits outside the control", () => {
    renderSections("standard");
    const header = screen.getByRole("button", { name: "Queue" });
    expect(header.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    // The count rides the trailing cluster, a sibling of the control.
    expect(header.textContent).toBe("Queue");
    expect(header.parentElement!.textContent).toContain("6");
  });

  it("quiet: count right after the label, chevron trailing the run", () => {
    renderSections("quiet");
    const header = screen.getByRole("button", { name: "Queue6" });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(header.lastElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(header.lastElementChild!.getAttribute("class")).toContain(
      "opacity-0",
    );
  });

  it("quiet: keeps a section's header actions in the trailing cluster", () => {
    renderSections("quiet", (s) =>
      s.key === "queue" ? <button type="button">Fold</button> : null,
    );
    const action = screen.getByRole("button", { name: "Fold" });
    const header = screen.getByRole("button", { name: "Queue6" });
    // A sibling of the control, never inside it.
    expect(header.contains(action)).toBe(false);
  });
});
