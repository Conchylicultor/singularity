import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { FloatingAction, FloatingActionFadeIn } from "../index";

/**
 * A popup opened from inside the panel is drawn outside the panel's box, so
 * reaching for it reads as leaving the control. The panel must stay open while
 * that popup is open, and close normally once it is not.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Subject({ menuOpen }: { menuOpen: boolean }) {
  return (
    <FloatingAction label="Picker" trigger={<span>pill</span>}>
      <FloatingActionFadeIn>
        {/* Controlled, so the test decides when the popup is open. */}
        <DropdownMenu open={menuOpen} onOpenChange={() => {}}>
          <DropdownMenuTrigger>menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </FloatingActionFadeIn>
    </FloatingAction>
  );
}

function isOpen(wrapper: HTMLElement): boolean {
  return wrapper.hasAttribute("data-open");
}

describe("FloatingAction held by a popup opened inside it", () => {
  it("stays open after the pointer leaves while the popup is open", () => {
    const { getByLabelText, rerender } = render(<Subject menuOpen={false} />);
    const wrapper = getByLabelText("Picker");

    fireEvent.pointerEnter(wrapper);
    expect(isOpen(wrapper)).toBe(true);

    rerender(<Subject menuOpen={true} />);
    fireEvent.pointerLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(isOpen(wrapper)).toBe(true);

    // Escape belongs to the popup: it must not close the panel under it.
    fireEvent.keyDown(wrapper, { key: "Escape" });
    expect(isOpen(wrapper)).toBe(true);

    rerender(<Subject menuOpen={false} />);
    expect(isOpen(wrapper)).toBe(false);
  });

  it("closes on pointer leave as usual when no popup is open", () => {
    const { getByLabelText } = render(<Subject menuOpen={false} />);
    const wrapper = getByLabelText("Picker");
    fireEvent.pointerEnter(wrapper);
    fireEvent.pointerLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(isOpen(wrapper)).toBe(false);
  });
});
