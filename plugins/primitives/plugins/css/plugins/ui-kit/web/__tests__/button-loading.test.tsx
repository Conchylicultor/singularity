import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, fireEvent, waitFor, act } from "@testing-library/react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

afterEach(cleanup);

function spinner(root: HTMLElement) {
  return root.querySelector("svg.animate-spin");
}

describe("Button loading", () => {
  it("explicit `loading` shows a spinner and disables the button", () => {
    const { getByRole } = render(<Button loading>Save</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("data-loading")).toBe("true");
    expect(spinner(btn)).not.toBeNull();
    // Text buttons keep their label alongside the spinner.
    expect(btn.textContent).toContain("Save");
  });

  it("not loading by default: no spinner, enabled", () => {
    const { getByRole } = render(<Button>Save</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("data-loading")).toBeNull();
    expect(spinner(btn)).toBeNull();
  });

  it("icon-sized buttons replace their glyph with the spinner while loading", () => {
    const { getByRole } = render(
      <Button size="icon-sm" loading aria-label="refresh">
        <svg data-testid="glyph" />
      </Button>,
    );
    const btn = getByRole("button");
    expect(spinner(btn)).not.toBeNull();
    expect(btn.querySelector('[data-testid="glyph"]')).toBeNull();
  });

  it("auto-pending: an async onClick disables + spins until it settles", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onClick = () => gate;

    const { getByRole } = render(<Button onClick={onClick}>Go</Button>);
    const btn = getByRole("button") as HTMLButtonElement;

    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);

    // Pending begins synchronously on click.
    await waitFor(() => expect(btn.disabled).toBe(true));
    expect(spinner(btn)).not.toBeNull();

    await act(async () => {
      release();
      await gate;
    });

    // Settling clears pending.
    await waitFor(() => expect(btn.disabled).toBe(false));
    expect(spinner(btn)).toBeNull();
  });

  it("a void-returning onClick never enters the pending state", () => {
    const onClick = () => {};
    const { getByRole } = render(<Button onClick={onClick}>Go</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    fireEvent.click(btn);
    expect(btn.disabled).toBe(false);
    expect(spinner(btn)).toBeNull();
  });
});
