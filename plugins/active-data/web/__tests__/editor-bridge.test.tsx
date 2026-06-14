import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { TextEditor, TextEditorSlots } from "@plugins/primitives/plugins/text-editor/web";
import { ActiveData } from "../slots";
import { useActiveDataNodeExtensions } from "../internal/node-extension-bridge";

// Proves the editor bridge: an active-data `display:"inline"` contribution
// renders as a chip *inside the Lexical editor* (not just on read surfaces),
// driven entirely by the generic union-pattern node — no per-tag Lexical wiring.
// Uses a throwaway inline tag so the test doesn't couple active-data to any
// specific contributor.
function TestChip({ content }: { content: string; attrs: Record<string, string> }) {
  return <button data-testid="chip">{content}</button>;
}

const plugin = {
  id: "editor-bridge-test",
  description: "editor bridge fixture",
  contributions: [
    ActiveData.Tag({ display: "inline", pattern: /@mention-\w+/g, component: TestChip }),
    TextEditorSlots.NodeExtensions({
      id: "active-data-inline",
      useExtensions: useActiveDataNodeExtensions,
    }),
  ],
} as unknown as LoadedPlugin;

afterEach(cleanup);

describe("active-data inline tags render as chips in the Lexical editor", () => {
  it("deserializes an inline token into a chip via the generic node bridge", async () => {
    render(
      <PluginProvider plugins={[plugin]}>
        <TextEditor value="hi @mention-bob there" onChange={() => {}} />
      </PluginProvider>,
    );
    // The token becomes a decorator chip; its component renders.
    const chip = await screen.findByTestId("chip");
    expect(chip.textContent).toBe("@mention-bob");
  });

  it("shows a generic Remove affordance on the chip when the editor is editable", async () => {
    render(
      <PluginProvider plugins={[plugin]}>
        <TextEditor value="hi @mention-bob there" onChange={() => {}} />
      </PluginProvider>,
    );
    await screen.findByTestId("chip");
    // The bridge wraps every inline chip in a generic × removal affordance.
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("omits the Remove affordance when the editor is read-only", async () => {
    render(
      <PluginProvider plugins={[plugin]}>
        <TextEditor value="hi @mention-bob there" onChange={() => {}} disabled />
      </PluginProvider>,
    );
    // The chip still renders, but no removal × in a non-editable editor (mirrors
    // read surfaces, which render the contribution directly without the bridge).
    await screen.findByTestId("chip");
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});
