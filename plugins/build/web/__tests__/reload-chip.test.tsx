import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  advice: { kind: "none" } as { kind: string; [k: string]: unknown },
}));
vi.mock("../hooks/use-reload-advice", () => ({
  useReloadAdvice: () => state.advice,
}));

import { cleanup, render } from "@testing-library/react";
import { ReloadChip } from "../components/reload-chip";

afterEach(() => {
  cleanup();
  state.advice = { kind: "none" };
});

/** The collapsed bar's Reload chip: present exactly when a reload is due. */
describe("ReloadChip", () => {
  it("renders nothing when no reload is due", () => {
    const { container } = render(<ReloadChip />);
    expect(container.innerHTML).toBe("");
  });

  it("stale: a blue Reload named for why", () => {
    state.advice = { kind: "stale" };
    const { getByRole } = render(<ReloadChip />);
    const button = getByRole("button");
    expect(button.getAttribute("aria-label")).toBe(
      "Server was rebuilt — click to reload this tab",
    );
    expect(button.className).toContain("bg-info");
  });

  it("broken: red, since something already fails", () => {
    state.advice = { kind: "broken", stale: false, failedCount: 1 };
    const { getByRole } = render(<ReloadChip />);
    expect(getByRole("button").className).toContain("bg-destructive");
  });
});
