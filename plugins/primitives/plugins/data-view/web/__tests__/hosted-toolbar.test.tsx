import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { hoverRevealGroup } from "@plugins/primitives/plugins/hover-reveal/web";
import type {
  CreateOption,
  DataViewId,
  HostedToolbar,
  HostedToolbarParts,
} from "../../core";
import { DataViewShellFrame } from "../components/data-view";
import { HostedOptions } from "../components/toolbar/hosted-options";
import {
  DataViewControlsProvider,
  type DataViewControlsContextValue,
} from "../components/controls/controls-context";
import type { ViewModel } from "../internal/use-data-view-model";

/**
 * The hosted toolbar: no band, the surface's frame places the parts. The shell
 * routes every state through the frame (so the card never reflows as config
 * settles), and the options trigger is the compact fold's own — search on its
 * first page, a badge while a query narrows the list.
 */

const plugin = {
  id: "data-view-hosted-toolbar-test",
  description: "hosted toolbar fixture",
  contributions: [],
} as unknown as LoadedPlugin;

const STORAGE_KEY = "hosted" as DataViewId;

let lastParts: HostedToolbarParts | null = null;

const hosted: HostedToolbar = {
  kind: "hosted",
  frame: (parts) => {
    lastParts = parts;
    return (
      <section data-testid="frame">
        <header>
          {parts.switcher}
          {parts.creators}
          {parts.options}
        </header>
        {parts.body}
      </section>
    );
  },
};

function renderShell(viewModel: ViewModel, creators?: CreateOption[]) {
  lastParts = null;
  return render(
    <PluginProvider plugins={[plugin]}>
      <DataViewShellFrame
        storageKey={STORAGE_KEY}
        viewModel={viewModel}
        toolbar={hosted}
        creators={creators}
      >
        {() => <div data-testid="body">rows</div>}
      </DataViewShellFrame>
    </PluginProvider>,
  );
}

afterEach(cleanup);

describe("hosted toolbar — shell", () => {
  it("renders the loading state through the frame, with no options and no band", () => {
    const { container } = renderShell({ ready: false } as ViewModel, [
      { id: "new", label: "New thing", onSelect: () => {} },
    ]);

    expect(screen.getByTestId("frame")).toBeTruthy();
    expect(lastParts!.options).toBeNull();
    expect(lastParts!.switcher).toBeNull();
    // Creators are the surface's own: placeable before the config lands.
    expect(screen.getByRole("button", { name: "New thing" })).toBeTruthy();
    // No stand-in band, and the root is the reveal group the band would be.
    expect(container.querySelector(".sticky")).toBeNull();
    expect((container.firstElementChild as HTMLElement).className).toContain(
      hoverRevealGroup,
    );
  });

  it("renders the no-views placeholder through the frame", () => {
    renderShell({
      ready: true,
      instances: [],
      activeId: "",
    } as unknown as ViewModel);

    expect(screen.getByTestId("frame").textContent).toMatch(
      /No views configured/,
    );
    expect(lastParts!.creators).toBeNull();
  });
});

function renderOptions(query: string) {
  return render(
    <PluginProvider plugins={[plugin]}>
      <DataViewControlsProvider {...({} as DataViewControlsContextValue)}>
        <HostedOptions
          query={query}
          onQueryChange={() => {}}
          searchPlaceholder="Search agents"
        />
      </DataViewControlsProvider>
    </PluginProvider>,
  );
}

describe("hosted toolbar — options trigger", () => {
  it("is a quiet, hover-revealed trigger at rest", () => {
    renderOptions("");

    const trigger = screen.getByRole("button", { name: "View options" });
    expect(trigger.textContent).toBe("");
    expect(trigger.className).toContain("group-hover");
  });

  it("badges and pins itself visible while a query narrows the list", () => {
    renderOptions("abc");

    const trigger = screen.getByRole("button", { name: "View options" });
    expect(trigger.textContent).toBe("1");
    expect(trigger.className).not.toContain("group-hover");
  });

  it("opens on the search field, with the surface's placeholder", () => {
    renderOptions("");

    act(() => screen.getByRole("button", { name: "View options" }).click());
    expect(screen.getByPlaceholderText("Search agents")).toBeTruthy();
  });
});
