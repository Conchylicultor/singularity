import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { Shortcuts } from "../slots";
import { ShortcutManager } from "../internal/shortcut-manager";
import { registerShortcuts } from "../internal/dynamic-registry";

afterEach(cleanup);

const plugins = [
  {
    id: "primitives.shortcuts",
    description: "shortcuts fixture",
    slots: Shortcuts,
    contributions: [],
  } as unknown as LoadedPlugin,
];

/** A Space shortcut, beside an element whose own keydown handler consumes Space. */
function setup() {
  const handler = vi.fn();
  const unregister = registerShortcuts([
    { id: "test.space", keys: "space", label: "Space", handler },
  ]);
  const { getByTestId } = render(
    <PluginProvider plugins={plugins}>
      <ShortcutManager />
      <div
        data-testid="owner"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " ") e.preventDefault();
        }}
      />
      <div data-testid="bystander" tabIndex={0} />
    </PluginProvider>,
  );
  const press = (testId: string) =>
    getByTestId(testId).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      }),
    );
  return { handler, press, unregister };
}

describe("shortcut manager", () => {
  it("fires on a key nothing else handled", () => {
    const s = setup();
    s.press("bystander");
    expect(s.handler).toHaveBeenCalledTimes(1);
    s.unregister();
  });

  it("yields a key an element already handled (defaultPrevented)", () => {
    const s = setup();
    s.press("owner");
    expect(s.handler).not.toHaveBeenCalled();
    s.unregister();
  });
});
