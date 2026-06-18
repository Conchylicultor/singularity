import { describe, it, expect, afterEach, vi } from "vitest";
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

  it("renders a component-form contribution as its custom widget", () => {
    const toolbarSlot = defineRenderSlot<AppShellToolbarItem>(
      "app-shell-test.toolbar.component",
    );
    const plugin = {
      id: "app-shell-test-component",
      description: "component toolbar fixture",
      contributions: [
        toolbarSlot({
          id: "widget",
          component: () => <div data-testid="widget">Widget</div>,
        }),
      ],
    } as unknown as LoadedPlugin;

    const { getByTestId } = render(
      <PluginProvider plugins={[plugin]}>
        <AppShellLayout toolbarSlot={toolbarSlot}>
          <ChromeProbe />
        </AppShellLayout>
      </PluginProvider>,
    );

    expect(getByTestId("widget").textContent).toBe("Widget");
  });

  it("fails loudly on a malformed item with no renderable form", () => {
    const toolbarSlot = defineRenderSlot<AppShellToolbarItem>(
      "app-shell-test.toolbar.malformed",
    );
    const plugin = {
      id: "app-shell-test-malformed",
      description: "malformed toolbar fixture",
      contributions: [
        // The union forbids this at the type level; only an `as any` cast (or
        // an untyped JS contribution) can force it in. It must throw, not paint
        // an invisible nothing.
        toolbarSlot(
          { id: "bad", label: "Ghost" } as unknown as Parameters<
            typeof toolbarSlot
          >[0],
        ),
      ],
    } as unknown as LoadedPlugin;

    // Rendering surfaces the throw loudly rather than silently painting an
    // invisible nothing. React logs the failed render, so silence the noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <PluginProvider plugins={[plugin]}>
          <AppShellLayout toolbarSlot={toolbarSlot}>
            <ChromeProbe />
          </AppShellLayout>
        </PluginProvider>,
      ),
    ).toThrow(/neither `component` nor `onClick`/);
    spy.mockRestore();
  });
});
