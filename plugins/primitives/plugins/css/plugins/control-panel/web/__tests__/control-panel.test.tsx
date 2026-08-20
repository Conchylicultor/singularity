import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ControlPanel } from "../internal/namespace";

afterEach(cleanup);

// The element is inferred from props — there is no `as`. Same rule as `css/row`'s
// `Row`, so an author learns it once, and a clickable row can never be declared
// as a `<button>` that then nests interactive content.
describe("ControlPanel.Row — the host element is inferred", () => {
  it("renders an <a> when given href", () => {
    render(
      <ControlPanel>
        <ControlPanel.Row href="/somewhere">Link row</ControlPanel.Row>
      </ControlPanel>,
    );
    const row = screen.getByText("Link row").closest("a, button, div");
    expect(row?.tagName).toBe("A");
  });

  it("renders a <button> when given onSelect", () => {
    render(
      <ControlPanel>
        <ControlPanel.Row onSelect={vi.fn()}>Button row</ControlPanel.Row>
      </ControlPanel>,
    );
    expect(screen.getByRole("button", { name: "Button row" })).toBeTruthy();
  });

  it("renders a non-interactive <div> with neither", () => {
    render(
      <ControlPanel>
        <ControlPanel.Row>Plain row</ControlPanel.Row>
      </ControlPanel>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    const row = screen.getByText("Plain row").closest("div.cp-row");
    expect(row).not.toBeNull();
  });
});

// One selection language per meaning. The single-select row is the one most
// likely to drift back: a highlighted row reads as HOVER, so "selected" has to
// be a mark that appears, never a fill.
describe("ControlPanel.Row — one selection language per meaning", () => {
  it('select="radio" marks the row with a checkmark and NO background fill', () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Row select="radio" checked onSelect={vi.fn()}>
          Status
        </ControlPanel.Row>
      </ControlPanel>,
    );
    const row = screen.getByRole("radio", { name: "Status" });
    expect(row.getAttribute("aria-checked")).toBe("true");

    // A glyph is drawn…
    expect(container.querySelector("svg")).not.toBeNull();
    // …and the row's own classes carry no resting background at all. Only a
    // `hover:`-prefixed one is allowed.
    const resting = row.className
      .split(/\s+/)
      .filter((c) => c.startsWith("bg-"));
    expect(resting).toEqual([]);
  });

  it('select="radio" draws no mark when unchecked', () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Row select="radio" checked={false} onSelect={vi.fn()}>
          Status
        </ControlPanel.Row>
      </ControlPanel>,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(
      screen
        .getByRole("radio", { name: "Status" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it('select="check" renders the shared CheckboxIndicator', () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Row select="check" checked onSelect={vi.fn()}>
          Title
        </ControlPanel.Row>
      </ControlPanel>,
    );
    expect(screen.getByRole("checkbox", { name: "Title" })).toBeTruthy();
    // The indicator box is the selection-indicator primitive's: a filled
    // `rounded-checkbox` square, never a hand-rolled box with a radius class.
    expect(container.querySelector(".rounded-checkbox")).not.toBeNull();
  });

  it('select="switch" owns the trailing cell and ignores a passed `trailing`', () => {
    render(
      <ControlPanel>
        <ControlPanel.Row
          select="switch"
          checked
          trailing="ignored"
          onSelect={vi.fn()}
        >
          Show sub-tasks
        </ControlPanel.Row>
      </ControlPanel>,
    );
    const row = screen.getByRole("switch", { name: "Show sub-tasks" });
    expect(row.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("ignored")).toBeNull();

    // The switch is the LAST grid cell (the trailing track), not the leading one
    // — that is what keeps the icon rail empty and aligned on a settings panel.
    const cells = Array.from(row.children);
    const knob = row.querySelector('[data-state="checked"]');
    expect(knob).not.toBeNull();
    expect(cells.at(-1)?.contains(knob!)).toBe(true);
  });
});

// The container separates its children — an author never places a divider. That
// inversion is what makes a conditionally-null section leave no orphan rule.
describe("ControlPanel — the container draws the hairline", () => {
  it("pairs the band container with the inset owner on ONE box", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Section label="Properties">
          <ControlPanel.Row>Title</ControlPanel.Row>
        </ControlPanel.Section>
      </ControlPanel>,
    );
    // The first band's rule is cancelled by painting over the box's own
    // padding-box top edge, which is only where the rule lands because the SAME
    // element insets the content by `--cp-panel-pad`. Split them onto two boxes
    // and the mask misses by exactly that pad.
    const body = container.querySelector(".cp-body")!;
    expect(body.classList.contains("cp-panel")).toBe(true);
  });

  it("marks a Section and a Footer as bands, and nothing else", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Section label="Properties">
          <ControlPanel.Row>Title</ControlPanel.Row>
        </ControlPanel.Section>
        <ControlPanel.Section label="Group by">
          <ControlPanel.RuleList>
            <ControlPanel.Row>Status</ControlPanel.Row>
          </ControlPanel.RuleList>
          <ControlPanel.Empty>Nothing yet</ControlPanel.Empty>
        </ControlPanel.Section>
        <ControlPanel.Footer>
          <ControlPanel.Row tone="danger" onSelect={vi.fn()}>
            Clear filter
          </ControlPanel.Row>
        </ControlPanel.Footer>
      </ControlPanel>,
    );
    // Three bands: two sections and the footer. `RuleList` and `Empty` are NOT
    // bands — both are used INSIDE a section (a filter is one sentence read down
    // the page), so marking either would draw a rule in the middle of a band.
    const bands = Array.from(container.querySelectorAll(".cp-band"));
    expect(bands.length).toBe(3);
    expect(container.querySelector("[data-cp-footer]")?.classList).toContain(
      "cp-band",
    );

    // And no band places separator chrome of its own (a hand-rolled `border-t` /
    // `h-px bg-border` hairline) — the rule is drawn FOR it.
    for (const band of bands) {
      const classes = band.className.split(/\s+/);
      expect(classes).not.toContain("border-t");
      expect(classes).not.toContain("h-px");
      expect(classes).not.toContain("cp-body");
    }
  });

  it("keeps the panel stack out of the layout, so ONE box spaces the bands", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Stack
          root={
            <ControlPanel.Section>
              <ControlPanel.Row>Rule</ControlPanel.Row>
            </ControlPanel.Section>
          }
        />
      </ControlPanel>,
    );
    // The stack is `display: contents`: a box the layout does not generate, so
    // the bands inside it are the panel body's own flex items however deeply the
    // framework's `renderIsolated` lineage spans wrap them. A second `cp-body`
    // here would put a second first-band mask at the wrong y.
    expect(container.querySelectorAll(".cp-body").length).toBe(1);
    const stack = container.querySelector(".cp-body > div")!;
    expect((stack as HTMLElement).style.display).toBe("contents");
  });
});

// The two leading tracks are derived from what the PANEL puts in them. jsdom
// applies no stylesheet, so what is asserted here is the CONTRACT the CSS reads:
// which cells declare themselves occupied. The rendered geometry is gated by
// `fixtures/control-panel/derived-tracks` in a real browser.
describe("ControlPanel — the leading tracks are derived from content", () => {
  it("publishes no occupancy marks when no row has a handle or an icon", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Section label="Properties">
          <ControlPanel.Row>Assignee</ControlPanel.Row>
          <ControlPanel.Row trailing="3">Status</ControlPanel.Row>
        </ControlPanel.Section>
      </ControlPanel>,
    );
    // Neither track is claimed, so the panel's `:has()` scan finds nothing and
    // both columns drop: a two-track row, flush on the panel's own content
    // inset, with no reserved gutter and no reserved icon column.
    expect(container.querySelectorAll("[data-cp-handle]").length).toBe(0);
    expect(container.querySelectorAll("[data-cp-icon]").length).toBe(0);
    // The cells are still all there — the CSS hides the two that lost their
    // track. An unhidden empty cell would auto-place into the track that took
    // its place and shove the label one column over, which is why each is
    // named rather than inferred by position.
    const row = container.querySelector(".cp-row")!;
    expect(
      [...row.children].map((c) => c.getAttribute("data-cp-cell")),
    ).toEqual(["gutter", "icon", "label", "trailing"]);
  });

  it("marks the gutter occupied when a row hangs a drag handle", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Section label="Properties">
          <ControlPanel.Row handle>Priority</ControlPanel.Row>
          <ControlPanel.Row>Assignee</ControlPanel.Row>
        </ControlPanel.Section>
      </ControlPanel>,
    );
    // ONE row claims it and the whole panel keeps the track — which is the
    // point: derive it per row and the handle-less row's label would sit one
    // column left of its neighbour's.
    const gutters = container.querySelectorAll('[data-cp-cell="gutter"]');
    expect(gutters.length).toBe(2);
    expect(container.querySelectorAll("[data-cp-handle]").length).toBe(1);
  });

  it("marks the icon column occupied by an icon OR a selection indicator", () => {
    const { container: withIcon } = render(
      <ControlPanel>
        <ControlPanel.Row icon={<span>i</span>}>Visibility</ControlPanel.Row>
      </ControlPanel>,
    );
    expect(withIcon.querySelectorAll("[data-cp-icon]").length).toBe(1);

    cleanup();
    // A selection row occupies that column exactly as a glyph does, so a panel
    // of checkboxes reserves it and every label in it still shares one x.
    const { container: withSelect } = render(
      <ControlPanel>
        <ControlPanel.Row select="check" checked onSelect={vi.fn()}>
          Status
        </ControlPanel.Row>
      </ControlPanel>,
    );
    expect(withSelect.querySelectorAll("[data-cp-icon]").length).toBe(1);
  });

  it("does NOT count a switch — its indicator is in the trailing cell", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Section label="Effects">
          <ControlPanel.Row select="switch" checked onSelect={vi.fn()}>
            Reverb
          </ControlPanel.Row>
          <ControlPanel.Row select="switch" checked={false} onSelect={vi.fn()}>
            Chorus
          </ControlPanel.Row>
        </ControlPanel.Section>
      </ControlPanel>,
    );
    // A switch-only panel reserves NOTHING in front of its labels: no handle, no
    // icon, so a two-track row (label | trailing) flush on the panel's own
    // inset. Reserving the column here cost every label in the panel 26px for a
    // track that painted nothing.
    expect(container.querySelectorAll("[data-cp-icon]").length).toBe(0);
    expect(container.querySelectorAll("[data-cp-handle]").length).toBe(0);
    // The indicator really is in the trailing cell, which is WHY the leading
    // one is free — the two facts are one fact.
    const row = screen.getByRole("switch", { name: "Reverb" });
    const cells = [...row.children];
    expect(
      cells.find((c) => c.getAttribute("data-cp-cell") === "icon")?.textContent,
    ).toBe("");
    expect(
      cells
        .find((c) => c.getAttribute("data-cp-cell") === "trailing")
        ?.querySelector('[data-state="checked"]'),
    ).not.toBeNull();
  });

  it("lets a switch row carry an icon, and counts THAT", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.Section label="Effects">
          <ControlPanel.Row
            select="switch"
            checked
            icon={<span data-testid="glyph">fx</span>}
            onSelect={vi.fn()}
          >
            Reverb
          </ControlPanel.Row>
        </ControlPanel.Section>
      </ControlPanel>,
    );
    // Both cells are occupied, and by different things — the icon leads, the
    // switch trails. Before the union was split this row was unspellable, so the
    // one surface that wanted it put its glyph in the LABEL cell, where it
    // shifted that row's text off the rail every other row sits on.
    const row = screen.getByRole("switch", { name: "Reverb" });
    const cells = [...row.children];
    const leading = cells.find(
      (c) => c.getAttribute("data-cp-cell") === "icon",
    );
    expect(leading?.querySelector('[data-testid="glyph"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-cp-icon]").length).toBe(1);
    expect(
      cells
        .find((c) => c.getAttribute("data-cp-cell") === "trailing")
        ?.querySelector('[data-state="checked"]'),
    ).not.toBeNull();
  });

  it("marks a rule row's gutter, so a builder derives the same track", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.RuleList>
          <ControlPanel.RuleRow
            handle
            prefix="Where"
            field={<span>Status</span>}
            operator={<span>is</span>}
          />
        </ControlPanel.RuleList>
      </ControlPanel>,
    );
    const gutter = container.querySelector(
      '.cp-rule > [data-cp-cell="gutter"]',
    );
    expect(gutter?.hasAttribute("data-cp-handle")).toBe(true);
  });
});

// One grid, shared by every builder — including the one with no operator.
describe("ControlPanel.RuleRow", () => {
  it("sets data-span=field when no operator is given", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.RuleList>
          <ControlPanel.RuleRow
            prefix="Sort by"
            field={<span>Updated</span>}
            value={<span>Descending</span>}
          />
        </ControlPanel.RuleList>
      </ControlPanel>,
    );
    const rule = container.querySelector(".cp-rule")!;
    expect(rule.getAttribute("data-span")).toBe("field");
    expect(rule.querySelector('[data-cp-cell="operator"]')).toBeNull();
  });

  it("leaves data-span unset when an operator IS given", () => {
    const { container } = render(
      <ControlPanel>
        <ControlPanel.RuleList>
          <ControlPanel.RuleRow
            prefix="Where"
            field={<span>Status</span>}
            operator={<span>is none of</span>}
            value={<span>Done</span>}
          />
        </ControlPanel.RuleList>
      </ControlPanel>,
    );
    const rule = container.querySelector(".cp-rule")!;
    expect(rule.getAttribute("data-span")).toBeNull();
    expect(rule.querySelector('[data-cp-cell="operator"]')).not.toBeNull();
  });

  it("renders the remove button with an accessible name", () => {
    render(
      <ControlPanel>
        <ControlPanel.RuleList>
          <ControlPanel.RuleRow
            prefix="Where"
            field={<span>Status</span>}
            operator={<span>is</span>}
            onRemove={vi.fn()}
            removeLabel="Remove filter"
          />
        </ControlPanel.RuleList>
      </ControlPanel>,
    );
    expect(screen.getByRole("button", { name: "Remove filter" })).toBeTruthy();
  });
});
