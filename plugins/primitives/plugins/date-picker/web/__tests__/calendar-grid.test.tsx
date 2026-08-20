import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Calendar } from "../components/calendar";

/**
 * The ARIA-grid half of the calendar — the part the pure `core/` tests cannot
 * see: which roles the DOM actually carries, which single button is in the tab
 * order, and that a key press moves real focus (including across a month page,
 * where the button focus lands on did not exist when the key was pressed).
 *
 * The clock is pinned so "today" is a fixed day inside the rendered month;
 * otherwise `aria-current="date"` would be asserted against whatever day CI
 * happens to run on.
 */
const TODAY = new Date(2026, 7, 20, 12, 0); // Thursday August 20 2026
const SELECTED = new Date(2026, 7, 14); // Friday August 14 2026

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The day buttons, in grid order. */
function dayButtons(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-day]")];
}

function dayButton(iso: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-day="${iso}"]`);
  if (el === null) throw new Error(`no day cell for ${iso}`);
  return el;
}

/** The `data-day` of whatever currently holds DOM focus. */
function focusedDay(): string | null {
  return document.activeElement?.getAttribute("data-day") ?? null;
}

/**
 * The grid's accessible name, resolved by hand through `aria-labelledby`. The
 * repo installs no jest-dom, so there is no `toHaveAccessibleName`; walking the
 * reference is also the stricter assertion, since it fails if the id ever stops
 * pointing at the month title.
 */
function gridName(): string {
  const id = screen.getByRole("grid").getAttribute("aria-labelledby");
  if (id === null) throw new Error("the grid carries no aria-labelledby");
  const label = document.getElementById(id);
  if (label === null) throw new Error(`aria-labelledby points at no #${id}`);
  return label.textContent ?? "";
}

describe("Calendar — grid structure", () => {
  beforeEach(() => {
    render(<Calendar value={SELECTED} locale="en-US" />);
  });

  it("declares one grid of seven rows", () => {
    expect(screen.getAllByRole("grid")).toHaveLength(1);
    // Six week rows plus the weekday header row.
    expect(screen.getAllByRole("row")).toHaveLength(7);
  });

  it("labels the grid with the month title", () => {
    expect(gridName()).toBe("August 2026");
  });

  it("gives every column a header naming its weekday in full", () => {
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(7);
    expect(headers.map((h) => h.getAttribute("aria-label"))).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    // The visible text stays the abbreviation.
    expect(headers[0]!.textContent).toBe("Sun");
  });

  it("puts all 42 days in grid cells", () => {
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
    expect(dayButtons()).toHaveLength(42);
  });

  it("names each day by its full date, not the bare number", () => {
    expect(dayButton("2026-08-21").getAttribute("aria-label")).toBe(
      "Friday, August 21, 2026",
    );
    expect(dayButton("2026-08-21").textContent).toBe("21");
  });
});

describe("Calendar — selection and today", () => {
  it("marks the selected day's CELL as selected, and no other", () => {
    render(<Calendar value={SELECTED} locale="en-US" />);
    const selected = screen
      .getAllByRole("gridcell")
      .filter((cell) => cell.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]!.querySelector("[data-day]")).toBe(
      dayButton("2026-08-14"),
    );
  });

  it("marks today's button as the current date, and no other", () => {
    render(<Calendar value={SELECTED} locale="en-US" />);
    const current = dayButtons().filter(
      (b) => b.getAttribute("aria-current") === "date",
    );
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(dayButton("2026-08-20"));
  });

  it("no longer presents days as pressed toggles", () => {
    render(<Calendar value={SELECTED} locale="en-US" />);
    expect(
      dayButtons().filter((b) => b.hasAttribute("aria-pressed")),
    ).toHaveLength(0);
  });
});

describe("Calendar — roving tab stop", () => {
  it("puts exactly one day in the tab order — the selected one", () => {
    render(<Calendar value={SELECTED} locale="en-US" />);
    const tabbable = dayButtons().filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(dayButton("2026-08-14"));
  });

  it("falls back to today when nothing is selected", () => {
    render(<Calendar locale="en-US" />);
    const tabbable = dayButtons().filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(dayButton("2026-08-20"));
  });

  it("follows a click, so the next arrow key walks from the clicked day", () => {
    render(<Calendar value={SELECTED} locale="en-US" />);
    fireEvent.click(dayButton("2026-08-26"));
    expect(dayButton("2026-08-26").tabIndex).toBe(0);
    expect(dayButton("2026-08-14").tabIndex).toBe(-1);
  });

  it("never lands the tab stop on a disabled day", () => {
    // September, so today (August 20) is not a candidate either; `min` mid-month
    // then disables the 1st. A tabIndex=0 there would drop the whole calendar
    // out of the tab order, since a disabled button is not focusable.
    render(
      <Calendar
        month={new Date(2026, 8, 1)}
        min={new Date(2026, 8, 10)}
        locale="en-US"
      />,
    );
    const tabbable = dayButtons().filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(dayButton("2026-09-10"));
    expect((tabbable[0] as HTMLButtonElement).disabled).toBe(false);
    expect((dayButton("2026-09-01") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Calendar — keyboard navigation", () => {
  /**
   * Renders with `iso` selected — so the derived roving target IS that day —
   * and puts DOM focus there, the state a real Tab into the grid produces.
   */
  function renderAndFocus(iso: string) {
    const [y, m, d] = iso.split("-").map(Number);
    render(<Calendar value={new Date(y!, m! - 1, d!)} locale="en-US" />);
    dayButton(iso).focus();
    expect(focusedDay()).toBe(iso);
  }

  it("moves focus one day on ArrowRight", () => {
    renderAndFocus("2026-08-14");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(focusedDay()).toBe("2026-08-15");
  });

  it("moves focus one week on ArrowDown, and follows the tab stop with it", () => {
    renderAndFocus("2026-08-14");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(focusedDay()).toBe("2026-08-21");
    expect(dayButton("2026-08-21").tabIndex).toBe(0);
    expect(dayButton("2026-08-14").tabIndex).toBe(-1);
  });

  it("jumps to the week's edges on Home / End", () => {
    renderAndFocus("2026-08-14");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(focusedDay()).toBe("2026-08-09");
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(focusedDay()).toBe("2026-08-15");
  });

  it("pages the view and keeps focus when ArrowDown leaves the month", () => {
    renderAndFocus("2026-08-31");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(gridName()).toBe("September 2026");
    expect(focusedDay()).toBe("2026-09-07");
  });

  it("pages a month on PageDown and a year with Shift", () => {
    renderAndFocus("2026-08-14");
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    expect(gridName()).toBe("September 2026");
    expect(focusedDay()).toBe("2026-09-14");

    fireEvent.keyDown(document.activeElement!, {
      key: "PageUp",
      shiftKey: true,
    });
    expect(gridName()).toBe("September 2025");
    expect(focusedDay()).toBe("2025-09-14");
  });

  it("refuses a move past `min` and leaves focus where it was", () => {
    render(
      <Calendar value={SELECTED} min={new Date(2026, 7, 14)} locale="en-US" />,
    );
    dayButton("2026-08-14").focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(focusedDay()).toBe("2026-08-14");
    expect(gridName()).toBe("August 2026");
  });

  it("leaves a non-navigation key alone", () => {
    renderAndFocus("2026-08-14");
    const event = fireEvent.keyDown(document.activeElement!, { key: "a" });
    // `fireEvent` returns false when a handler called preventDefault.
    expect(event).toBe(true);
    expect(focusedDay()).toBe("2026-08-14");
  });
});

describe("Calendar — adjacent-month cells", () => {
  /**
   * A leading/trailing cell shows a day of the PREVIOUS/NEXT month, and August
   * 2026 has both: the grid opens on Sunday July 26 and runs past August 31 into
   * September. The cell must carry the day it displays — not the day number
   * pasted onto the month being viewed, which is how a picker ends up selecting
   * August 3 when the user clicked September 3.
   *
   * Nothing in `Calendar` builds an ISO day by concatenation today (every cell
   * is a real `Date` from `buildMonthGrid`, serialized by `toISODay`), and this
   * is the test that keeps it that way.
   */
  it("labels leading and trailing cells with their OWN month", () => {
    render(<Calendar value={SELECTED} locale="en-US" />);
    // First cell: Sunday July 26 2026 — July, not August 26.
    expect(dayButtons()[0]!.getAttribute("data-day")).toBe("2026-07-26");
    // Last cell: Saturday September 5 2026.
    expect(dayButtons().at(-1)!.getAttribute("data-day")).toBe("2026-09-05");
    expect(dayButton("2026-09-03").textContent).toBe("3");
    expect(dayButton("2026-09-03").getAttribute("aria-label")).toBe(
      "Thursday, September 3, 2026",
    );
  });

  it("selects the day a trailing cell SHOWS, not the same number in the viewed month", () => {
    const onSelect = vi.fn();
    render(<Calendar value={SELECTED} onSelect={onSelect} locale="en-US" />);
    fireEvent.click(dayButton("2026-09-03"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const picked = onSelect.mock.calls[0]![0] as Date;
    expect(picked.getFullYear()).toBe(2026);
    expect(picked.getMonth()).toBe(8); // September
    expect(picked.getDate()).toBe(3);
    // …and the view follows the selection into its own month, so the picked day
    // is not left off-screen.
    expect(gridName()).toBe("September 2026");
  });

  it("selects the day a leading cell SHOWS", () => {
    const onSelect = vi.fn();
    render(<Calendar value={SELECTED} onSelect={onSelect} locale="en-US" />);
    fireEvent.click(dayButton("2026-07-28"));

    const picked = onSelect.mock.calls[0]![0] as Date;
    expect(picked.getMonth()).toBe(6); // July
    expect(picked.getDate()).toBe(28);
    expect(gridName()).toBe("July 2026");
  });
});
