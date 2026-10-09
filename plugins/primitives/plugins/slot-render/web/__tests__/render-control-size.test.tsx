import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { useControlSize } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { defineRenderSlot } from "../internal/render-slot";

afterEach(cleanup);

/** Reports the density it inherits — what a contributed control would draw at. */
function SizeProbe({ id }: { id: string }) {
  return <span data-testid={id}>{useControlSize()}</span>;
}
const ProbeA = () => <SizeProbe id="a" />;
const ProbeB = () => <SizeProbe id="b" />;

function fixture() {
  const slot = defineRenderSlot<{ component: ComponentType }>({
    controlSize: "sm",
  });
  const plugin = {
    id: "slot-render-density-test",
    description: "density fixture",
    contributions: [
      slot({ id: "a", component: ProbeA }),
      slot({ id: "b", component: ProbeB }),
    ],
    // A rendered slot must be a declared slot — its id derives from here.
    slots: { bar: slot },
  } as unknown as LoadedPlugin;
  return { slot, plugin };
}

describe("a render slot's density", () => {
  it("gives every contribution the slot's declared controlSize", () => {
    const { slot, plugin } = fixture();
    const { getByTestId } = render(
      <PluginProvider plugins={[plugin]}>
        <slot.Render />
      </PluginProvider>,
    );
    expect(getByTestId("a").textContent).toBe("sm");
    expect(getByTestId("b").textContent).toBe("sm");
  });

  it("lets the host's .Render controlSize override it for the whole slot", () => {
    const { slot, plugin } = fixture();
    const { getByTestId } = render(
      <PluginProvider plugins={[plugin]}>
        <slot.Render controlSize="md" />
      </PluginProvider>,
    );
    expect(getByTestId("a").textContent).toBe("md");
    expect(getByTestId("b").textContent).toBe("md");
  });
});
