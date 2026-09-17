import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PortalHost } from "@plugins/primitives/plugins/overlay/plugins/portal-host/web";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";

/**
 * The seam this pins: ui-kit's portal wrappers draw into the nearest
 * `PortalHost`. Under the Fullscreen API a popup left under `body` is simply
 * not painted, which no type or lint can see — so the wiring is tested.
 */

afterEach(cleanup);

function OpenPopover() {
  return (
    <Popover open={true} onOpenChange={() => {}}>
      <PopoverTrigger>open</PopoverTrigger>
      <PopoverContent>popup body</PopoverContent>
    </Popover>
  );
}

describe("ui-kit portals honour PortalHost", () => {
  it("draws a popup opened inside a host into the host", async () => {
    const { container, findByText } = render(
      <PortalHost>
        <OpenPopover />
      </PortalHost>,
    );
    const el = await findByText("popup body");
    const host = container.querySelector("[data-portal-host]");
    expect(host).not.toBeNull();
    expect(host?.contains(el)).toBe(true);
  });

  it("draws under body, outside the render tree, with no host", async () => {
    const { container, findByText } = render(<OpenPopover />);
    const el = await findByText("popup body");
    expect(container.contains(el)).toBe(false);
    expect(document.body.contains(el)).toBe(true);
  });
});
