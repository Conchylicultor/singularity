import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { LoadedPlugin } from "@plugins/framework/plugins/web-sdk/core";
import {
  type AnyPane,
  Pane,
  type PaneStore,
  useIndexMatch,
} from "@plugins/primitives/plugins/pane/web";
import { defineApp, defineRoute } from "@plugins/primitives/plugins/pane/core";
import { createTestSurfaceStore, TestSurface } from "./surface-fixture";

// `appIndex` is a boolean, not a path: which app a pane is the index OF comes
// from the `app` it already declares. This suite pins what that buys — the
// resolution itself, the claim a pane can no longer make about someone else's
// app, and the two invariants that used to fail silently (an index pane with a
// URL of its own, and two index panes for one app).

const appA = defineApp({
  id: "ai-a",
  name: "App index A",
  basePath: "/app",
  iconKey: "science",
});
const appB = defineApp({
  id: "ai-b",
  name: "App index B",
  basePath: "/other",
  iconKey: "science",
});

function plugin(id: string, panes: AnyPane[]) {
  return {
    id,
    description: "app-index test fixture",
    contributions: panes.map((pane) => Pane.Register({ pane })),
  } as unknown as LoadedPlugin;
}

/** Prints the id of whichever pane the surface's bare root resolves to. */
function IndexProbe({ basePath }: { basePath: string }) {
  const id = useIndexMatch(basePath)?.panes[0]?.pane.id ?? "none";
  return <div data-testid="index">{id}</div>;
}

let store: PaneStore;

beforeEach(() => {
  store = createTestSurfaceStore({ live: false });
});

afterEach(cleanup);

describe("appIndex", () => {
  it("resolves the index pane from its own app's basePath", () => {
    const indexRoute = defineRoute({ id: "ai-index-a", segment: "" });
    const indexPane = Pane.define({
      route: indexRoute,
      app: appA,
      appIndex: true,
      component: () => null,
    });

    const view = render(
      <TestSurface
        store={store}
        basePath="/app"
        plugins={[plugin("ai-p1", [indexPane])]}
      >
        <IndexProbe basePath="/app" />
      </TestSurface>,
    );

    expect(view.getByTestId("index").textContent).toBe("ai-index-a");
  });

  it("is not the index of an app it does not belong to", () => {
    // A pane whose home is app A cannot claim app B's bare root — it names no
    // path, so there is nothing to point at the wrong app.
    const indexRoute = defineRoute({ id: "ai-index-b", segment: "" });
    const indexPane = Pane.define({
      route: indexRoute,
      app: appA,
      appIndex: true,
      component: () => null,
    });

    const view = render(
      <TestSurface
        store={store}
        basePath={appB.basePath}
        plugins={[plugin("ai-p2", [indexPane])]}
      >
        <IndexProbe basePath={appB.basePath} />
      </TestSurface>,
    );

    expect(view.getByTestId("index").textContent).toBe("none");
  });

  it("rejects an index pane that owns a URL segment", () => {
    const badRoute = defineRoute({
      id: "ai-index-segmented",
      segment: "somewhere",
    });
    const bad = Pane.define({
      route: badRoute,
      app: appA,
      appIndex: true,
      component: () => null,
    });

    expect(() =>
      render(
        <TestSurface
          store={store}
          basePath="/app"
          plugins={[plugin("ai-p3", [bad])]}
        >
          <IndexProbe basePath="/app" />
        </TestSurface>,
      ),
    ).toThrow(/cannot have a segment of its own/);
  });

  it("rejects a second index pane for the same app", () => {
    const firstRoute = defineRoute({ id: "ai-index-first", segment: "" });
    const first = Pane.define({
      route: firstRoute,
      app: appA,
      appIndex: true,
      component: () => null,
    });
    const secondRoute = defineRoute({ id: "ai-index-second", segment: "" });
    const second = Pane.define({
      route: secondRoute,
      app: appA,
      appIndex: true,
      component: () => null,
    });

    expect(() =>
      render(
        <TestSurface
          store={store}
          basePath="/app"
          plugins={[plugin("ai-p4", [first, second])]}
        >
          <IndexProbe basePath="/app" />
        </TestSurface>,
      ),
    ).toThrow(/Pane index collision/);
  });
});
