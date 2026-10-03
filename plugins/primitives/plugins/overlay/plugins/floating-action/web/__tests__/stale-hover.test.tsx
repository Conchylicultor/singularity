import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createPortal } from "react-dom";
import { FloatingAction, FloatingActionFadeIn } from "../index";

/**
 * Hover is the pointer over the panel's DOM box. A portaled overlay opened
 * from inside (the element picker) is inside it only in the React tree, and
 * when it unmounts under the cursor no leave fires on the panel — the panel
 * must still close once the pointer moves somewhere outside it.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Subject({ overlay }: { overlay: boolean }) {
  return (
    <FloatingAction label="Bar" trigger={<span>dot</span>}>
      <FloatingActionFadeIn>
        {overlay &&
          createPortal(<div data-testid="overlay">overlay</div>, document.body)}
      </FloatingActionFadeIn>
    </FloatingAction>
  );
}

function isOpen(wrapper: HTMLElement): boolean {
  return wrapper.hasAttribute("data-open");
}

describe("FloatingAction hover", () => {
  it("closes when the pointer moves outside after a portaled overlay unmounts", () => {
    const { getByLabelText, rerender } = render(<Subject overlay={true} />);
    const wrapper = getByLabelText("Bar");

    fireEvent.pointerEnter(wrapper);
    expect(isOpen(wrapper)).toBe(true);

    // The overlay goes away under the cursor: no leave reaches the panel.
    rerender(<Subject overlay={false} />);
    fireEvent.pointerMove(document.body);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(isOpen(wrapper)).toBe(false);
  });

  it("stays open while the pointer moves inside it", () => {
    const { getByLabelText, getByText } = render(<Subject overlay={false} />);
    const wrapper = getByLabelText("Bar");

    fireEvent.pointerEnter(wrapper);
    fireEvent.pointerMove(getByText("dot"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(isOpen(wrapper)).toBe(true);
  });
});
