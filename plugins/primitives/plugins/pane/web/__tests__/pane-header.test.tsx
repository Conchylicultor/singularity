import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { LoadedPlugin } from "@plugins/framework/plugins/web-sdk/core";
import {
  Pane,
  PaneChrome,
  type PaneStore,
} from "@plugins/primitives/plugins/pane/web";
import { defineApp, defineRoute } from "@plugins/primitives/plugins/pane/core";
import { paneHeaderContributions } from "../header-slot";
import { Pane as PaneSlots } from "../slots";
import { createTestSurfaceStore, TestSurface } from "./surface-fixture";

// One pane header is ONE slot, title included. These pin the two facts that
// makes true and that nothing else in the suite would notice breaking: the pane
// contributes its own title item into every declared header, and `titleOnly`
// keeps that item while dropping the ordinary ones.

const testApp = defineApp({
  id: "hdr-app",
  name: "Header test app",
  basePath: "/app",
  iconKey: "science",
});

const headerRoute = defineRoute({ id: "hdr-pane", segment: "" });
const headerPane = Pane.define({
  route: headerRoute,
  app: testApp,
  appIndex: true,
  component: () => null,
});

function ActionWidget() {
  return <span>an-action</span>;
}

// The pane plugin as the browser loads it: its `contributions` ARE the live
// array the declaration pass rewrites, so the title items exist only because a
// plugin declared a header slot (below) — the same path production takes.
const panePlugin = {
  id: "primitives.pane",
  description: "pane",
  contributions: paneHeaderContributions,
  slots: PaneSlots,
} as unknown as LoadedPlugin;

// The pane's own plugin: declaring the pane is what NAMES its header slot.
const hostPlugin = {
  id: "hdr.host",
  description: "host",
  contributions: [
    Pane.Register({ pane: headerPane }),
    headerPane.Actions({ id: "act", component: ActionWidget }),
  ],
  slots: { pane: headerPane },
} as unknown as LoadedPlugin;

const plugins = [panePlugin, hostPlugin];

/**
 * The header's one growing cell — `AdaptiveBar.Yield grow`, i.e. `fillClasses`.
 * Found by the classes because that pair IS the mechanism under test; a marker
 * attribute added for the test's benefit would pin nothing about the layout.
 */
function growingCell(container: HTMLElement): HTMLElement | null {
  const cells = [
    ...container.querySelectorAll<HTMLElement>("div.min-w-0.flex-1"),
  ];
  // The AdaptiveBar ROOT carries the same pair — it is its own row's grow cell —
  // and it is the only other one. It says so with `whitespace-nowrap`.
  return (
    cells.find((el) => !el.classList.contains("whitespace-nowrap")) ?? null
  );
}

describe("pane header", () => {
  let store: PaneStore;

  beforeEach(() => {
    store = createTestSurfaceStore({ live: false });
  });
  afterEach(cleanup);

  it("renders the pane's title as a contribution of the header slot", () => {
    render(
      <TestSurface store={store} plugins={plugins}>
        <PaneChrome pane={headerPane} title="A title">
          body
        </PaneChrome>
      </TestSurface>,
    );
    expect(screen.getByText("A title")).toBeTruthy();
    expect(screen.getByText("an-action")).toBeTruthy();
  });

  it("puts the title FIRST in natural order", () => {
    const { container } = render(
      <TestSurface store={store} plugins={plugins}>
        <PaneChrome pane={headerPane} title="A title">
          body
        </PaneChrome>
      </TestSurface>,
    );
    const text = container.textContent ?? "";
    expect(text.indexOf("A title")).toBeLessThan(text.indexOf("an-action"));
  });

  it("renders no title for a pane that has none", () => {
    render(
      <TestSurface store={store} plugins={plugins}>
        <PaneChrome pane={headerPane}>body</PaneChrome>
      </TestSurface>,
    );
    expect(screen.queryByText("A title")).toBeNull();
    expect(screen.getByText("an-action")).toBeTruthy();
  });

  // The title's cell GROWS (`min-w-0 flex-1` — a Fill), which is what puts the
  // row's slack between the title and the actions instead of in front of both.
  // A pane with no title must land its actions in the same place as one with a
  // title, and that holds only if the cell is still there, still growing, when
  // the item inside it renders nothing — otherwise the slack would jump to the
  // front of the row and shift every action left.
  //
  // jsdom computes no layout, so what is pinned here is the MECHANISM (the
  // growing cell exists in both cases, and is merely empty in one) rather than
  // the pixels it produces. The pixels follow from `flex: 1 1 0%`, which the
  // browser is entitled to be trusted on.
  it("keeps the growing cell when the title renders nothing", () => {
    const withTitle = render(
      <TestSurface store={store} plugins={plugins}>
        <PaneChrome pane={headerPane} title="A title">
          body
        </PaneChrome>
      </TestSurface>,
    );
    const filled = growingCell(withTitle.container);
    expect(filled?.textContent).toBe("A title");
    cleanup();

    const without = render(
      <TestSurface store={store} plugins={plugins}>
        <PaneChrome pane={headerPane}>body</PaneChrome>
      </TestSurface>,
    );
    const empty = growingCell(without.container);
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toBe("");
  });

  it("titleOnly keeps the title and drops the ordinary occupants", () => {
    render(
      <TestSurface store={store} plugins={plugins}>
        <PaneChrome pane={headerPane} title="A title" titleOnly>
          body
        </PaneChrome>
      </TestSurface>,
    );
    expect(screen.getByText("A title")).toBeTruthy();
    expect(screen.queryByText("an-action")).toBeNull();
  });
});
