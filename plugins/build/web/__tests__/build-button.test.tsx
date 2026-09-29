import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

// The two reads the button branches on, driven directly: the build history
// (`useLive`) and the reload advice. Nothing here needs a server.
const state = vi.hoisted(() => ({
  history: {} as Record<string, unknown>,
  advice: { kind: "none" } as { kind: string; [k: string]: unknown },
}));
vi.mock("@plugins/network/plugins/live/web", () => ({
  useLive: () => state.history,
}));
vi.mock("../hooks/use-reload-advice", () => ({
  useReloadAdvice: () => state.advice,
}));
vi.mock(
  "@plugins/primitives/plugins/live-state/web",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useNotificationsChannelStatuses: () => ({
      worktree: "open",
      central: "open",
    }),
  }),
);

import { cleanup, fireEvent, render } from "@testing-library/react";
import { ResourceError } from "@plugins/primitives/plugins/live-state/core";
import { BuildButton } from "../components/build-button";

/**
 * The Builds button while the build history has no value. The incident: a tab
 * running a pre-deploy bundle whose history read failed forever rendered a
 * disabled wrench — reading as "loading" — and its early return hid the Reload
 * segment the tab needed.
 */

const STALE = "Server was rebuilt — click to reload this tab";
const OUTDATED =
  "This tab is out of date and can't load some data — reload to fix";

afterEach(() => {
  cleanup();
  state.advice = { kind: "none" };
});

describe("BuildButton without history", () => {
  it("loading: an inert wrench, alone when no reload is due", () => {
    state.history = {
      status: "loading",
      refetch: vi.fn(),
    };
    const { getAllByRole } = render(<BuildButton />);
    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Builds");
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("loading + stale tab: the Reload segment still shows", () => {
    state.history = {
      status: "loading",
      refetch: vi.fn(),
    };
    state.advice = { kind: "stale" };
    const { getByRole } = render(<BuildButton />);
    expect(getByRole("button", { name: STALE })).not.toBeNull();
  });

  it("failed: a live wrench saying so, whose click retries — plus Reload", () => {
    const refetch = vi.fn(() => Promise.resolve());
    state.history = {
      status: "error",
      error: new ResourceError(
        "loader-failed",
        "Resource build.history fetch failed: 500",
        null,
      ),
      refetch,
    };
    state.advice = { kind: "outdated", stale: false, count: 1 };
    const { getByRole } = render(<BuildButton />);
    const wrench = getByRole("button", {
      name: /couldn't load the build history.*Click to retry/i,
    }) as HTMLButtonElement;
    expect(wrench.disabled).toBe(false);
    fireEvent.click(wrench);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(getByRole("button", { name: OUTDATED })).not.toBeNull();
  });

  it("failed because the tab is out of date: the wrench offers the reload", () => {
    state.history = {
      status: "error",
      error: new ResourceError(
        "client-outdated",
        "This tab is out of date — reload to load this.",
        null,
      ),
      refetch: vi.fn(() => Promise.resolve()),
    };
    const { getByRole } = render(<BuildButton />);
    const wrench = getByRole("button", {
      name: /App updated — reload.*Click to reload/,
    }) as HTMLButtonElement;
    expect(wrench.disabled).toBe(false);
  });
});
