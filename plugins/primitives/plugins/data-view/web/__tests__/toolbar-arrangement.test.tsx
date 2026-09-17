import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import type {
  CreateOption,
  DataViewDensity,
  ToolbarArrangement,
  ToolbarParts,
} from "../../core";
import { DataViewToolbar } from "../components/toolbar/data-view-toolbar";
import {
  DataViewControlsProvider,
  type DataViewControlsContextValue,
} from "../components/controls/controls-context";

/**
 * The arrangement seam: no `toolbar` renders the default inline bar; an
 * arrangement receives the parts built in the forms it asked for; and the
 * compact fold stays the host's, whatever arrangement was passed.
 */

const plugin = {
  id: "data-view-toolbar-arrangement-test",
  description: "toolbar arrangement fixture",
  contributions: [],
} as unknown as LoadedPlugin;

const CREATORS: CreateOption[] = [
  { id: "new", label: "New thing", onSelect: () => {} },
];

let lastParts: ToolbarParts | null = null;

const recordingArrangement: ToolbarArrangement = {
  id: "recording",
  forms: { search: "bare", controls: "round", creators: "round" },
  component: (parts) => {
    lastParts = parts;
    return (
      <div data-testid="arrangement">
        {parts.switcher.chip}
        {parts.search}
        {parts.creators}
      </div>
    );
  },
};

function renderToolbar(opts: {
  arrangement?: ToolbarArrangement;
  density?: DataViewDensity;
  searchPlaceholder?: string;
}) {
  lastParts = null;
  return render(
    <PluginProvider plugins={[plugin]}>
      <DataViewControlsProvider {...({} as DataViewControlsContextValue)}>
        <DataViewToolbar
          query=""
          onQueryChange={() => {}}
          creators={CREATORS}
          switcher={{
            strip: <div data-testid="strip" />,
            chip: <div data-testid="chip" />,
          }}
          switcherCount={2}
          density={opts.density}
          arrangement={opts.arrangement}
          searchPlaceholder={opts.searchPlaceholder}
        />
      </DataViewControlsProvider>
    </PluginProvider>,
  );
}

afterEach(cleanup);

describe("DataViewToolbar arrangements", () => {
  it("renders the default bar when no arrangement is passed", () => {
    renderToolbar({});

    expect(screen.getByTestId("strip")).toBeTruthy();
    expect(screen.queryByTestId("chip")).toBeNull();
    // The field search in its fixed lane, and a labelled creator button.
    const input = screen.getByPlaceholderText("Search…");
    expect(input.parentElement!.className).toContain("w-48");
    expect(screen.getByRole("button", { name: "New thing" }).textContent).toBe(
      "New thing",
    );
  });

  it("hands an arrangement the parts, built in the forms it asked for", () => {
    renderToolbar({
      arrangement: recordingArrangement,
      searchPlaceholder: "Search apps",
    });

    expect(screen.getByTestId("arrangement")).toBeTruthy();
    expect(screen.getByTestId("chip")).toBeTruthy();
    expect(screen.queryByTestId("strip")).toBeNull();
    // Bare search: the `/` hint, and the surface's own placeholder.
    expect(screen.getByText("/")).toBeTruthy();
    const input = screen.getByPlaceholderText("Search apps");
    // Round creator: the label moves off the button face.
    expect(screen.getByRole("button", { name: "New thing" }).textContent).toBe(
      "",
    );

    act(() => lastParts!.focusSearch());
    expect(document.activeElement).toBe(input);
  });

  it("folds to the compact bar under density=compact, whatever the arrangement", () => {
    renderToolbar({ arrangement: recordingArrangement, density: "compact" });

    expect(screen.queryByTestId("arrangement")).toBeNull();
    expect(lastParts).toBeNull();
    // The compact bar shows the strip (more than one view) and folds search away.
    expect(screen.getByTestId("strip")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Search…")).toBeNull();
  });
});
