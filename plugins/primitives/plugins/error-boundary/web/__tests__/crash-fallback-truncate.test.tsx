import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PluginProvider } from "@plugins/framework/plugins/web-sdk/core";
import { PluginErrorBoundary } from "../components/plugin-error-boundary";

// Regression guard for: "a long crash message overflows the fallback row and
// pushes the Fix/Retry actions off the clickable area." The fix makes the
// message the single truncating grow-cell (wrapped in <Fill>) inside the
// single-line <Line>, so the trailing recovery actions always stay in-flow.
//
// jsdom has no layout engine, so this pins the *composition that guarantees the
// fix* — the class contract — rather than measured pixels: the message leaf
// carries Text's single-line truncate recipe (`min-w-0 truncate`), sits in the
// Fill grow-cell (`min-w-0 flex-1`), keeps the full text available via `title`,
// and the Retry action renders as an in-flow sibling AFTER the message.

const LONG_MESSAGE =
  "usePaneStore must be used within a PaneSurfaceProvider. This surface tried " +
  "to read pane state before the provider mounted, which usually means a pane " +
  "was rendered outside its host. Check the surface composition and the route.";

function Boom(): never {
  throw new Error(LONG_MESSAGE);
}

// React logs caught boundary errors to console.error; that is expected noise.
const consoleError = console.error;
afterEach(() => {
  cleanup();
  console.error = consoleError;
});

describe("CrashFallback layout", () => {
  it("makes the message the truncating grow-cell and keeps Retry in-flow", () => {
    console.error = () => {};
    // No plugins registered → the ErrorBoundary.Action slot is empty, so the
    // fallback renders just identity + message + Retry (the always-present core).
    const { getByText, getByRole } = render(
      <PluginProvider plugins={[]}>
        <PluginErrorBoundary label="tasks/task-list">
          <Boom />
        </PluginErrorBoundary>
      </PluginProvider>,
    );

    // The message renders in full text, with the full string preserved on title.
    const message = getByText(LONG_MESSAGE);
    expect(message.getAttribute("title")).toBe(LONG_MESSAGE);

    // It is the truncation leaf: Text-in-Line applies the single-line recipe.
    expect(message.className).toContain("truncate");
    expect(message.className).toContain("min-w-0");

    // Its parent is the Fill grow-cell that absorbs slack + enables shrink.
    const fill = message.parentElement!;
    expect(fill.className).toContain("flex-1");
    expect(fill.className).toContain("min-w-0");

    // The Retry action is a real in-flow sibling AFTER the message's cell —
    // never pushed out of the clickable area by the message length.
    const retry = getByRole("button", { name: "Retry" });
    const row = fill.parentElement!;
    expect(retry.parentElement).toBe(row);
    const children = Array.from(row.children);
    expect(children.indexOf(retry)).toBeGreaterThan(children.indexOf(fill));
  });
});
