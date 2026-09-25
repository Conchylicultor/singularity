import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

// "Fold line" = the `… N more` row a fold rule leaves at the end of a section.
// Unrelated to the tree's fold-children header action ("Fold" above).
describe("GroupedSections — fold line", () => {
  const FOLDED = [
    {
      key: "done",
      label: "Done",
      count: 5,
      entries: [],
      fold: { hidden: 3, open: false },
    },
    { key: "queue", label: "Queue", count: 2, entries: [] },
  ] as unknown as DataViewSection<unknown>[];

  function renderFolded(opts: {
    collapsed?: ReadonlySet<string>;
    setOpen?: (key: string, open: boolean) => void;
    sections?: DataViewSection<unknown>[];
  }) {
    return render(
      <GroupedSections
        sections={opts.sections ?? FOLDED}
        collapsedSections={opts.collapsed}
        foldLines={{
          open: new Set(),
          setOpen: opts.setOpen ?? (() => {}),
          summary: "Folding all but: Age is less than 30",
        }}
      >
        {(section) => <div>rows of {section.key}</div>}
      </GroupedSections>,
    );
  }

  it("renders the fold line with its hidden count, only on a folded section", () => {
    renderFolded({});
    const line = screen.getByRole("button", { name: "… 3 more" });
    expect(line.getAttribute("aria-expanded")).toBe("false");
    expect(line.getAttribute("title")).toBe(
      "Folding all but: Age is less than 30",
    );
    // The unfolded section draws no line.
    expect(screen.getAllByRole("button", { name: /more$/ })).toHaveLength(1);
  });

  it("clicking the fold line opens that section's fold", () => {
    const calls: [string, boolean][] = [];
    renderFolded({ setOpen: (key, open) => calls.push([key, open]) });
    fireEvent.click(screen.getByRole("button", { name: "… 3 more" }));
    expect(calls).toEqual([["done", true]]);
  });

  it("an open fold line reads Show less and closes it", () => {
    const calls: [string, boolean][] = [];
    renderFolded({
      setOpen: (key, open) => calls.push([key, open]),
      sections: [
        { ...FOLDED[0]!, fold: { hidden: 3, open: true } },
      ] as DataViewSection<unknown>[],
    });
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(calls).toEqual([["done", false]]);
  });

  it("a collapsed section hides its fold line with its rows", () => {
    renderFolded({ collapsed: new Set(["done"]) });
    expect(screen.queryByText("rows of done")).toBeNull();
    expect(screen.queryByRole("button", { name: "… 3 more" })).toBeNull();
  });
});
