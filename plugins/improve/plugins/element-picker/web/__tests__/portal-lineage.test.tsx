import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { PluginMarkerMiddleware } from "../internal/marker-middleware";
import { collectMeta } from "../internal/collect-meta";
import { appendLineage, parseLineage } from "../internal/marker-lineage";

afterEach(cleanup);

// A contribution that portals its content out to document.body — the popover /
// dialog / menu case from the bug report. ViewportOverlay is a real portal that
// re-stamps the forwarded `data-*` bag, so it stands in for any base-ui portal
// surface here without needing open-state plumbing.
function portaledContribution(): Contribution {
  return { _pluginId: "my.plugin", id: "my.contrib" } as unknown as Contribution;
}

describe("plugin lineage survives a portal", () => {
  it("resolves the owning plugin for an element portaled out of its slot", () => {
    render(
      <PluginMarkerMiddleware slotId="test.slot" contribution={portaledContribution()}>
        <ViewportOverlay>
          <button data-testid="target">Pick me</button>
        </ViewportOverlay>
      </PluginMarkerMiddleware>,
    );
    // The button is portaled to document.body, severed from the marker span.
    const target = document.querySelector<HTMLElement>('[data-testid="target"]')!;
    expect(target).not.toBeNull();

    const meta = collectMeta(target);
    expect(meta.pluginId).toBe("my.plugin");
    expect(meta.slotId).toBe("test.slot");
    expect(meta.contributionId).toBe("my.plugin:my.contrib");
  });

  it("regression: a portaled element with no bridge resolves no plugin", () => {
    // Same portal, but rendered *outside* any marker middleware — proves the
    // portal genuinely severs DOM ancestry, so the lineage attribute (not the
    // span) is what carries the owner across.
    render(
      <ViewportOverlay>
        <button data-testid="orphan">No owner</button>
      </ViewportOverlay>,
    );
    const orphan = document.querySelector<HTMLElement>('[data-testid="orphan"]')!;
    expect(collectMeta(orphan).pluginId).toBeUndefined();
  });

  it("carries the full outer→inner lineage as a path across the portal", () => {
    render(
      <PluginMarkerMiddleware
        slotId="outer.slot"
        contribution={{ _pluginId: "outer.plugin" } as unknown as Contribution}
      >
        <PluginMarkerMiddleware slotId="inner.slot" contribution={portaledContribution()}>
          <ViewportOverlay>
            <button data-testid="nested">Deep</button>
          </ViewportOverlay>
        </PluginMarkerMiddleware>
      </PluginMarkerMiddleware>,
    );
    const meta = collectMeta(
      document.querySelector<HTMLElement>('[data-testid="nested"]')!,
    );
    expect(meta.pluginId).toBe("my.plugin");
    expect(meta.path).toBe("outer.plugin@outer.slot > my.plugin@inner.slot");
  });
});

describe("lineage serialization", () => {
  it("round-trips markers and skips owner-less contributions", () => {
    const a = appendLineage(undefined, { pluginId: "p1", slotId: "s1" });
    const b = appendLineage(a, { pluginId: "p2", slotId: "s2", contributionId: "p2:c" });
    // A contribution with no plugin id leaves the chain untouched.
    const c = appendLineage(b, { pluginId: "", slotId: "s3" });
    expect(c).toBe(b);
    expect(parseLineage(c)).toEqual([
      { pluginId: "p1", slotId: "s1" },
      { pluginId: "p2", slotId: "s2", contributionId: "p2:c" },
    ]);
  });

  it("parses an empty lineage to []", () => {
    expect(parseLineage(undefined)).toEqual([]);
  });
});
