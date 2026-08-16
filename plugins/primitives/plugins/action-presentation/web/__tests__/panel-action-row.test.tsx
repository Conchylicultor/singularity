import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PanelActionRow } from "../index";

/**
 * The property the whole design leans on: this row renders with NO menu, no
 * popover and no context of any kind above it. The overflow panel that hosts it
 * is always mounted (it holds relocated widgets' live DOM), so it can never be a
 * `DropdownMenuContent` — and a row that needed a menu context would crash there
 * exactly the way a `DropdownMenuLabel` outside a Group does.
 */

function Icon({ className }: { className?: string }) {
  return <svg data-testid="icon" className={className} />;
}

afterEach(cleanup);

describe("PanelActionRow", () => {
  it("renders standalone as a real button, with no provider above it", () => {
    const { getByRole, getByTestId } = render(
      <PanelActionRow icon={Icon} label="Duplicate" />,
    );
    const button = getByRole("button", { name: /Duplicate/ });
    expect(button.tagName).toBe("BUTTON");
    // Not a submit button: the panel may sit inside a form.
    expect(button.getAttribute("type")).toBe("button");
    expect(getByTestId("icon")).toBeTruthy();
  });

  it("fires its onClick", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <PanelActionRow icon={Icon} label="Duplicate" onClick={onClick} />,
    );
    getByRole("button").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire while disabled", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <PanelActionRow
        icon={Icon}
        label="Duplicate"
        onClick={onClick}
        disabled
      />,
    );
    const button = getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("formats the raw shortcut string, so the two forms cannot drift", () => {
    // Same `formatShortcutLabel` as the full form's `Kbd` — the row takes the
    // raw `"mod+k"`, never a pre-formatted label.
    const { container } = render(
      <PanelActionRow icon={Icon} label="Search" shortcut="mod+k" />,
    );
    const kbd = container.querySelector("kbd");
    expect(kbd).toBeTruthy();
    expect(kbd?.textContent).not.toBe("mod+k");
    expect(kbd?.textContent?.toLowerCase()).toContain("k");
  });

  it("renders no shortcut affordance when there is no shortcut", () => {
    const { container } = render(<PanelActionRow icon={Icon} label="Search" />);
    expect(container.querySelector("kbd")).toBeNull();
  });
});
