import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OptionRow } from "../components/option-row";

afterEach(cleanup);

function classesOf(testId: string): Set<string> {
  return new Set(screen.getByTestId(testId).className.split(/\s+/).filter(Boolean));
}

// The layout classes that decide where the row's content sits. If selecting an
// option changes ANY of these, the option list shifts under the cursor as the
// user arrows through it — the exact regression this row was extracted to kill.
const GEOMETRY = /^(p|px|py|pl|pr|m|mx|my|ml|mr|border|gap|w|min-w|flex)(-|$)/;

function geometryOf(testId: string): string[] {
  return [...classesOf(testId)]
    .filter((c) => GEOMETRY.test(c))
    // Colours ride on the same `border-*` prefix as the border WIDTH; only the
    // width is geometry, so drop the tinted variants.
    .filter((c) => !/^border-(primary|transparent)/.test(c))
    .sort();
}

describe("OptionRow — selection never moves the row", () => {
  it("renders identical geometry whether or not the option is selected", () => {
    render(
      <>
        <OptionRow selected={false} multi={false} onClick={() => {}}>
          <span data-testid="idle-body">idle</span>
        </OptionRow>
        <OptionRow selected multi={false} onClick={() => {}}>
          <span data-testid="sel-body">selected</span>
        </OptionRow>
      </>,
    );
    const [idle, selected] = screen.getAllByRole("button");
    idle!.setAttribute("data-testid", "idle");
    selected!.setAttribute("data-testid", "sel");

    // Guard against a vacuous pass: if the filter ever stops matching anything,
    // [] === [] would hold while the rows drifted freely.
    expect(geometryOf("idle")).toEqual(
      expect.arrayContaining(["border", "px-sm", "py-xs", "w-full"]),
    );
    expect(geometryOf("sel")).toEqual(geometryOf("idle"));
  });

  it("reserves the border in both states so the selected ring adds no width", () => {
    render(
      <>
        <OptionRow selected={false} multi={false} onClick={() => {}}>
          idle
        </OptionRow>
        <OptionRow selected multi={false} onClick={() => {}}>
          selected
        </OptionRow>
      </>,
    );
    const [idle, selected] = screen.getAllByRole("button");
    // Idle is border-transparent, NOT border-less: the box exists in both states.
    expect(idle!.className).toContain("border-transparent");
    expect(selected!.className).toContain("border-primary");
    expect(idle!.className).toMatch(/(^|\s)border(\s|$)/);
    expect(selected!.className).toMatch(/(^|\s)border(\s|$)/);
  });

  it("keeps hover on a different channel from selected", () => {
    render(
      <>
        <OptionRow selected={false} multi={false} onClick={() => {}}>
          idle
        </OptionRow>
        <OptionRow selected multi={false} onClick={() => {}}>
          selected
        </OptionRow>
      </>,
    );
    const [idle, selected] = screen.getAllByRole("button");
    // A selected row must not also carry the muted hover fill, or hovering it
    // reads as "about to deselect".
    expect(idle!.className).toContain("hover:bg-muted/50");
    expect(selected!.className).not.toContain("hover:bg-muted/50");
  });

  it("renders a static row (no button) when no onClick is supplied", () => {
    render(
      <OptionRow selected multi={false}>
        read-only
      </OptionRow>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
