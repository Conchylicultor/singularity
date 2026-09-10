import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mounting NotificationsProvider otherwise schedules real fetch flushes at
// module eval — the convention the live-state hazard suites established.
vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  NotificationsProvider,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import {
  markDeferredPluginsFailed,
  resetDeferredLoadStateForTests,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  deploymentResource,
  type DeploymentState,
} from "@plugins/build/plugins/deployment/core";
import { useReloadAdvice, type ReloadAdvice } from "../hooks/use-reload-advice";
import { ReloadChip } from "../components/reload-chip";

/**
 * The Reload chip on the Build button, and the one signal behind it.
 *
 * `useReloadAdvice` reads two things: the deployment resource (is the server
 * serving a different frontend than this tab runs?) and the page-global
 * deferred-load store (did a plugin fail to load?). Both are driven directly —
 * the resource by seeding its query the way the live-state suites do, the store
 * through its own writers — so nothing here needs a server.
 */

const BAKED = "graph-baked";

/** A deployment whose `web` carrier serves `graph`. */
function servingGraph(graph: string): DeploymentState {
  const unresolved = { resolved: false as const, reason: "test" };
  return {
    kind: "unknown",
    reason: "test",
    deployable: [
      {
        id: "web",
        commit: unresolved,
        graph: { resolved: true, value: graph },
        ancestorOfTarget: unresolved,
      },
    ],
  };
}

function wrapperServing(graph: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false, staleTime: Infinity },
    },
  });
  client.setQueryData(
    queryKeyFor(deploymentResource.key, undefined),
    servingGraph(graph),
  );
  return ({ children }: { children: ReactNode }) => (
    <NotificationsProvider queryClient={client}>
      {children}
    </NotificationsProvider>
  );
}

beforeEach(() => {
  // The graph hash baked into "this tab's" bundle. Without it the hook is inert
  // (a dev server has no baked graph), and no tab could ever read as stale.
  vi.stubEnv("VITE_BUILD_GRAPH", BAKED);
  resetDeferredLoadStateForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  resetDeferredLoadStateForTests();
});

describe("useReloadAdvice", () => {
  it("is none when the server serves this tab's own bundle and nothing failed", () => {
    const { result } = renderHook(() => useReloadAdvice(), {
      wrapper: wrapperServing(BAKED),
    });
    expect(result.current).toEqual({ kind: "none" });
  });

  it("is stale when the server serves a different bundle", () => {
    const { result } = renderHook(() => useReloadAdvice(), {
      wrapper: wrapperServing("graph-newer"),
    });
    expect(result.current).toEqual({ kind: "stale" });
  });

  it("is broken when a plugin failed, counting the failures", () => {
    markDeferredPluginsFailed([
      "apps/plugins/website/plugins/landing/plugins/contact",
      "apps/plugins/story/plugins/lenses",
    ]);
    const { result } = renderHook(() => useReloadAdvice(), {
      wrapper: wrapperServing(BAKED),
    });
    expect(result.current).toEqual({
      kind: "broken",
      stale: false,
      failedCount: 2,
    });
  });

  it("keeps the stale bit when the tab is both broken and stale", () => {
    markDeferredPluginsFailed(["apps/plugins/story/plugins/lenses"]);
    const { result } = renderHook(() => useReloadAdvice(), {
      wrapper: wrapperServing("graph-newer"),
    });
    expect(result.current).toEqual({
      kind: "broken",
      stale: true,
      failedCount: 1,
    });
  });

  it("turns broken the moment a failure is published, without a remount", () => {
    const { result, rerender } = renderHook(() => useReloadAdvice(), {
      wrapper: wrapperServing(BAKED),
    });
    expect(result.current.kind).toBe("none");
    markDeferredPluginsFailed(["apps/plugins/story/plugins/lenses"]);
    rerender();
    expect(result.current.kind).toBe("broken");
  });
});

const STALE_ONLY = "Server was rebuilt — click to reload this tab";
const BROKEN_ONLY = "Part of the app didn't load — reload to fix";
const BOTH =
  "This tab is out of date and part of the app didn't load — reload to fix";

describe("ReloadChip", () => {
  it("renders nothing when no reload is needed", () => {
    const { container } = render(<ReloadChip advice={{ kind: "none" }} />);
    expect(container.textContent).toBe("");
  });

  const cases: Array<{
    name: string;
    advice: ReloadAdvice;
    message: string;
    tint: string;
    notTint: string;
  }> = [
    {
      name: "stale only → blue, rebuilt copy",
      advice: { kind: "stale" },
      message: STALE_ONLY,
      tint: "text-info",
      notTint: "text-destructive",
    },
    {
      name: "failed only → red, didn't-load copy",
      advice: { kind: "broken", stale: false, failedCount: 3 },
      message: BROKEN_ONLY,
      tint: "text-destructive",
      notTint: "text-info",
    },
    {
      name: "failed and stale → red, copy names both",
      advice: { kind: "broken", stale: true, failedCount: 1 },
      message: BOTH,
      tint: "text-destructive",
      notTint: "text-info",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const { getByRole } = render(<ReloadChip advice={c.advice} />);
      // The accessible name carries the whole message: colour and a hover
      // tooltip are otherwise the only difference between the two states.
      const chip = getByRole("button", { name: c.message });
      expect(chip.textContent).toBe("Reload");
      expect(chip.className).toContain(c.tint);
      expect(chip.className).not.toContain(c.notTint);
    });
  }

  it("is a span that behaves as a button, never a <button> nested in the Build button", () => {
    const { getByRole } = render(
      <button type="button">
        Builds
        <ReloadChip advice={{ kind: "broken", stale: false, failedCount: 1 }} />
      </button>,
    );
    const chip = getByRole("button", { name: BROKEN_ONLY });
    expect(chip.tagName).toBe("SPAN");
    expect(chip.getAttribute("tabindex")).toBe("0");
    expect(chip.parentElement?.closest("button")).not.toBeNull();
  });

  it("shows its message as a tooltip on hover", async () => {
    const { getByRole, findByText } = render(
      <ReloadChip advice={{ kind: "broken", stale: true, failedCount: 1 }} />,
    );
    const chip = getByRole("button", { name: BOTH });
    fireEvent.pointerEnter(chip, { pointerType: "mouse" });
    fireEvent.mouseEnter(chip);
    fireEvent.focus(chip);
    // The tooltip popup, not the chip's own aria-label.
    expect(
      await findByText(BOTH, { selector: "*:not([role=button])" }),
    ).not.toBeNull();
  });

  describe("pressing it", () => {
    const reload = vi.fn();
    const realLocation = window.location;

    beforeEach(() => {
      reload.mockReset();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...realLocation, reload },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: realLocation,
      });
    });

    function renderInTrigger() {
      const onTrigger = vi.fn();
      const utils = render(
        // The Build button opens the Builds popover on click; the chip must
        // reload without also opening it.
        <button type="button" onClick={onTrigger} onKeyDown={onTrigger}>
          Builds
          <ReloadChip advice={{ kind: "stale" }} />
        </button>,
      );
      return {
        ...utils,
        onTrigger,
        chip: utils.getByRole("button", { name: STALE_ONLY }),
      };
    }

    it("reloads on click without reaching the trigger", () => {
      const { chip, onTrigger } = renderInTrigger();
      fireEvent.click(chip);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(onTrigger).not.toHaveBeenCalled();
    });

    it("reloads on Enter and Space, and ignores other keys", () => {
      const { chip, onTrigger } = renderInTrigger();
      fireEvent.keyDown(chip, { key: "a" });
      expect(reload).not.toHaveBeenCalled();
      fireEvent.keyDown(chip, { key: "Enter" });
      fireEvent.keyDown(chip, { key: " " });
      expect(reload).toHaveBeenCalledTimes(2);
      // Only the ignored key bubbled to the trigger.
      expect(onTrigger).toHaveBeenCalledTimes(1);
    });
  });
});
