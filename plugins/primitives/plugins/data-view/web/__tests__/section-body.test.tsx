import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DataViewSection } from "../../core";
import { SectionBody } from "../components/section-body";

afterEach(cleanup);

// "Fold line" = the `… N more` row a fold rule leaves at the end of a section.
// Unrelated to the tree's fold-children header action.
const FOLDED = {
  key: "done",
  label: "Done",
  count: 5,
  entries: [],
  fold: { hidden: 3, open: false },
} as unknown as DataViewSection<unknown>;
const UNFOLDED = {
  key: "queue",
  label: "Queue",
  count: 2,
  entries: [],
} as unknown as DataViewSection<unknown>;

function renderBody(opts: {
  section?: DataViewSection<unknown>;
  setOpen?: (key: string, open: boolean) => void;
  children?: ReactNode;
}) {
  return render(
    <SectionBody
      section={opts.section ?? FOLDED}
      foldLines={{
        open: new Set(),
        setOpen: opts.setOpen ?? (() => {}),
        summary: "Folding all but: Age is less than 30",
      }}
      className="py-sm"
    >
      {opts.children === undefined ? <div>rows</div> : opts.children}
    </SectionBody>,
  );
}

describe("SectionBody — fold line", () => {
  it("ends a folded section in its fold line, with the hidden count", () => {
    renderBody({});
    const line = screen.getByRole("button", { name: "… 3 more" });
    expect(line.getAttribute("aria-expanded")).toBe("false");
    expect(line.getAttribute("title")).toBe(
      "Folding all but: Age is less than 30",
    );
  });

  it("draws no fold line on an unfolded section", () => {
    renderBody({ section: UNFOLDED });
    expect(screen.queryByRole("button", { name: /more$/ })).toBeNull();
    expect(screen.getByText("rows")).toBeTruthy();
  });

  it("clicking the fold line opens that section's fold", () => {
    const calls: [string, boolean][] = [];
    renderBody({ setOpen: (key, open) => calls.push([key, open]) });
    fireEvent.click(screen.getByRole("button", { name: "… 3 more" }));
    expect(calls).toEqual([["done", true]]);
  });

  it("an open fold line reads Show less and closes it", () => {
    const calls: [string, boolean][] = [];
    renderBody({
      setOpen: (key, open) => calls.push([key, open]),
      section: { ...FOLDED, fold: { hidden: 3, open: true } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(calls).toEqual([["done", false]]);
  });
});

// The alignment contract: the band pays the rail ONCE, and the fold line is a row
// INSIDE it that pays none of its own — so it lands where the band's entries
// land. A fold line carrying `rail-follow` itself is what drew it one row pad
// left of the list rows it closed.
describe("SectionBody — geometry", () => {
  it("puts the fold line in the same rail-paying band as the entries", () => {
    renderBody({});
    const band = screen.getByText("rows").parentElement!;
    const line = screen.getByRole("button", { name: "… 3 more" });
    expect(band.className).toContain("rail-follow");
    expect(band.contains(line)).toBe(true);
    expect(line.className).not.toContain("rail-follow");
    expect(line.className).toContain("p-row");
  });

  it("drops the block padding when every entry is folded", () => {
    renderBody({ children: null });
    const band = screen.getByRole("button", {
      name: "… 3 more",
    }).parentElement!;
    expect(band.className).toContain("rail-follow");
    expect(band.className).not.toContain("py-sm");
  });

  it("renders nothing for an empty, unfolded section", () => {
    const { container } = renderBody({ section: UNFOLDED, children: null });
    expect(container.firstChild).toBeNull();
  });
});
