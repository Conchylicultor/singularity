import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { FloatingAction, FloatingActionFadeIn } from "../index";

/**
 * Keyboard focus opens the panel, but `:focus-visible` is also what Chrome
 * gives focus a closing popover restores to its trigger after any key — so a
 * pointer moving outside must end a focus open, or the panel stays expanded
 * until the next click elsewhere. jsdom does not model `:focus-visible`, so the
 * match is stubbed: every focus here counts as keyboard focus.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ":focus-visible" ? true : matches.call(this, selector);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function Subject() {
  return (
    <FloatingAction label="Bar" trigger={<span>dot</span>}>
      <FloatingActionFadeIn>
        <button type="button">Improve</button>
      </FloatingActionFadeIn>
    </FloatingAction>
  );
}

function isOpen(wrapper: HTMLElement): boolean {
  return wrapper.hasAttribute("data-open");
}

describe("FloatingAction keyboard focus", () => {
  it("opens on keyboard focus and stays open while the pointer is still", () => {
    const { getByLabelText, getByText } = render(<Subject />);
    const wrapper = getByLabelText("Bar");

    fireEvent.focus(getByText("Improve"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(isOpen(wrapper)).toBe(true);
  });

  it("closes when the pointer moves outside while focus stays inside", () => {
    const { getByLabelText, getByText } = render(<Subject />);
    const wrapper = getByLabelText("Bar");

    // Focus restored to an item inside, the pointer already elsewhere.
    fireEvent.focus(getByText("Improve"));
    expect(isOpen(wrapper)).toBe(true);

    fireEvent.pointerMove(document.body);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(isOpen(wrapper)).toBe(false);
  });

  it("closes on pointer leave even though focus stays inside", () => {
    const { getByLabelText, getByText } = render(<Subject />);
    const wrapper = getByLabelText("Bar");

    fireEvent.pointerEnter(wrapper);
    fireEvent.focus(getByText("Improve"));
    fireEvent.pointerLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(isOpen(wrapper)).toBe(false);
  });
});
