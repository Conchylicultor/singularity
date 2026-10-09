import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  advice: { kind: "none" } as { kind: string; [k: string]: unknown },
}));
vi.mock("../hooks/use-reload-advice", () => ({
  useReloadAdvice: () => state.advice,
}));

import { cleanup, render } from "@testing-library/react";
import { ReloadGlance } from "../components/reload-button";

afterEach(() => {
  cleanup();
  state.advice = { kind: "none" };
});

/**
 * The collapsed bar's glance: the Build tray holding only the Reload pill,
 * present exactly when a reload is due. (The pill's own copy, fills and press
 * are covered against `ReloadButton` in reload-advice.test.tsx.)
 */
describe("ReloadGlance", () => {
  it("renders nothing when no reload is due", () => {
    const { container } = render(<ReloadGlance />);
    expect(container.innerHTML).toBe("");
  });

  it("stale: the info-filled Reload, named for why", () => {
    state.advice = { kind: "stale" };
    const { getAllByRole } = render(<ReloadGlance />);
    // The glance is the Reload pill and nothing else.
    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("aria-label")).toBe(
      "Server was rebuilt — click to reload this tab",
    );
    expect(buttons[0]!.className).toContain("bg-info-solid");
    expect(buttons[0]!.className).toContain("text-info-solid-foreground");
  });

  it("broken: the destructive fill, since something already fails", () => {
    state.advice = { kind: "broken", stale: false, failedCount: 1 };
    const { getByRole } = render(<ReloadGlance />);
    const button = getByRole("button");
    expect(button.className).toContain("bg-destructive-solid");
    expect(button.className).not.toContain("bg-info-solid");
  });

  it("sits in the tray, a filled pill inside the faint one", () => {
    state.advice = { kind: "stale" };
    const { getByRole } = render(<ReloadGlance />);
    const tray = getByRole("button").closest(".rounded-full.bg-muted");
    expect(tray).not.toBeNull();
  });
});
