/**
 * The filter-chip rules: what clicking a ranked row does (add, replace, remove,
 * or refuse on a daily-totals report that already holds its one filter), as the
 * pure rule and as the panel and chip bar render it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnalyticsFilter } from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import { STACKED_FILTERS_NOTE, clickRow } from "../internal/filters";
import { PANELS } from "../internal/panels";
import { RankedPanel } from "../components/ranked-panel";
import { FilterBar } from "../components/filter-bar";
import { report } from "./fixtures";

afterEach(cleanup);

const SEARCH: AnalyticsFilter = { dimension: "channel", value: "Search" };
const HOME: AnalyticsFilter = { dimension: "page", value: "/" };

describe("clickRow", () => {
  it("adds a filter on a new dimension", () => {
    expect(clickRow([], "raw", "channel", "Search")).toEqual({
      kind: "add",
      next: [SEARCH],
    });
  });

  it("removes the row's own filter", () => {
    expect(clickRow([SEARCH, HOME], "raw", "channel", "Search")).toEqual({
      kind: "remove",
      next: [HOME],
    });
  });

  it("replaces another value of the same dimension", () => {
    expect(clickRow([SEARCH], "raw", "channel", "Direct")).toEqual({
      kind: "replace",
      next: [{ dimension: "channel", value: "Direct" }],
    });
  });

  it("stacks any number of filters on a raw report", () => {
    expect(clickRow([SEARCH], "raw", "page", "/").kind).toBe("add");
  });

  it("refuses a second filter on a totals report, but still replaces and removes", () => {
    expect(clickRow([SEARCH], "totals", "page", "/")).toEqual({
      kind: "blocked",
      reason: STACKED_FILTERS_NOTE,
    });
    expect(clickRow([SEARCH], "totals", "channel", "Direct").kind).toBe(
      "replace",
    );
    expect(clickRow([SEARCH], "totals", "channel", "Search").kind).toBe(
      "remove",
    );
    expect(clickRow([], "totals", "page", "/").kind).toBe("add");
  });
});

function renderPanel(
  id: string,
  filters: AnalyticsFilter[],
  source: "raw" | "totals",
) {
  const onRowClick = vi.fn();
  const panel = PANELS.find((p) => p.id === id)!;
  render(
    <RankedPanel
      panel={panel}
      tabId={panel.tabs[0]!.id}
      onTab={() => {}}
      report={report()}
      source={source}
      filters={filters}
      onRowClick={onRowClick}
    />,
  );
  return onRowClick;
}

describe("RankedPanel", () => {
  it("reports a row click with its dimension and value", () => {
    const onRowClick = renderPanel("pages", [], "raw");
    fireEvent.click(screen.getByRole("button", { name: /\/story/ }));
    expect(onRowClick).toHaveBeenCalledWith("page", "/story");
  });

  it("marks the filtered row selected", () => {
    renderPanel("sources", [SEARCH], "raw");
    const search = screen.getByRole("button", { name: /Search/ });
    expect(search.getAttribute("aria-current")).toBe("true");
  });

  it("disables rows that would stack a second filter on a totals report", () => {
    renderPanel("pages", [SEARCH], "totals");
    const home = screen.getAllByRole("button", { name: /^\// })[0]!;
    expect((home as HTMLButtonElement).disabled).toBe(true);
    expect(home.getAttribute("title")).toBe(STACKED_FILTERS_NOTE);
  });

  it("keeps rows of the filtered dimension clickable on a totals report", () => {
    renderPanel("sources", [SEARCH], "totals");
    const direct = screen.getByRole("button", { name: /Direct/ });
    expect((direct as HTMLButtonElement).disabled).toBe(false);
  });

  it("says a dimension is not collected yet instead of showing no rows", () => {
    const panel = PANELS.find((p) => p.id === "locations")!;
    render(
      <RankedPanel
        panel={panel}
        tabId="countries"
        onTab={() => {}}
        report={report()}
        source="raw"
        filters={[]}
        onRowClick={() => {}}
      />,
    );
    expect(screen.getByText("Not collected yet.")).toBeTruthy();
  });
});

describe("FilterBar", () => {
  it("renders nothing without filters", () => {
    const { container } = render(
      <FilterBar
        filters={[]}
        source="raw"
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders a removable chip per filter and a Clear button", () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    render(
      <FilterBar
        filters={[SEARCH, HOME]}
        source="raw"
        onRemove={onRemove}
        onClear={onClear}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove filter Page is /" }),
    );
    expect(onRemove).toHaveBeenCalledWith("page");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalled();
    expect(screen.queryByText(STACKED_FILTERS_NOTE)).toBeNull();
  });

  it("explains, in one line, why a totals report takes no second filter", () => {
    render(
      <FilterBar
        filters={[SEARCH]}
        source="totals"
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText(STACKED_FILTERS_NOTE)).toBeTruthy();
  });
});
