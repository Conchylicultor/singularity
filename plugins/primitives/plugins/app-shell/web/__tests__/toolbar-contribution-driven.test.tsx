import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useContext } from "react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { SurfaceChromeContext } from "@plugins/primitives/plugins/pane/web";
import { AppShellLayout, type AppShellToolbarItem } from "../index";

// Reads the chrome ownership the shell hands to its content. When the toolbar
// bar is rendered, the toolbar owns the surface-edge chrome
// (contentOwnsTopChrome === false); when there's no bar, the content's own
// pane header owns it (true). This is the second half of the empty-bar fix:
// without a real toolbar the sidebar toggle must travel to the content.
function ChromeProbe() {
  const { contentOwnsTopChrome } = useContext(SurfaceChromeContext);
  return <div data-testid="probe">{String(contentOwnsTopChrome)}</div>;
}

afterEach(cleanup);

describe("AppShellLayout drives the chrome toolbar bar off real contributions", () => {
  it("renders no toolbar bar (content owns chrome) when the wired slot has zero contributions", () => {
    const toolbarSlot = defineRenderSlot<AppShellToolbarItem>(
      "app-shell-test.toolbar.empty",
    );
    const plugin = {
      id: "app-shell-test-empty",
      description: "empty toolbar fixture",
      contributions: [],
    } as unknown as LoadedPlugin;

    const { getByTestId, container } = render(
      <PluginProvider plugins={[plugin]}>
        <AppShellLayout toolbarSlot={toolbarSlot}>
          <ChromeProbe />
        </AppShellLayout>
      </PluginProvider>,
    );

    // No chrome-tier bar painted above the content…
    expect(container.querySelector(".h-chrome-bar")).toBeNull();
    // …and the content is handed the surface-edge chrome instead.
    expect(getByTestId("probe").textContent).toBe("true");
  });

  it("renders the toolbar bar (toolbar owns chrome) when the slot has a contribution", () => {
    const toolbarSlot = defineRenderSlot<AppShellToolbarItem>(
      "app-shell-test.toolbar.full",
    );
    const plugin = {
      id: "app-shell-test-full",
      description: "populated toolbar fixture",
      contributions: [
        toolbarSlot({ id: "btn", label: "ToolbarBtn", onClick: () => {} }),
      ],
    } as unknown as LoadedPlugin;

    const { getByText, getByTestId, container } = render(
      <PluginProvider plugins={[plugin]}>
        <AppShellLayout toolbarSlot={toolbarSlot}>
          <ChromeProbe />
        </AppShellLayout>
      </PluginProvider>,
    );

    // The bar is painted and renders the contribution…
    expect(container.querySelector(".h-chrome-bar")).not.toBeNull();
    expect(getByText("ToolbarBtn")).toBeTruthy();
    // …so the toolbar — not the content — owns the surface-edge chrome.
    expect(getByTestId("probe").textContent).toBe("false");
  });
});
