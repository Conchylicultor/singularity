import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PopupOpenScope } from "@plugins/primitives/plugins/popup-open/web";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

/**
 * The seam this pins: ui-kit's `Root` wrappers really do publish base-ui's open
 * state. The predecessor of this signal was a CSS selector naming a popup
 * library's attribute contract, and its Radix spelling sat dead for months
 * because nothing could observe whether it matched. A wiring test is the whole
 * reason the signal is a typed React value.
 */

afterEach(cleanup);

describe("ui-kit publishes popup open state", () => {
  it("holds the enclosing scope while an uncontrolled dropdown is open", () => {
    const { getByTestId, getByRole } = render(
      <PopupOpenScope>
        {(popupOpen) => (
          <>
            <span data-testid="held">{String(popupOpen)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger>menu</DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>item</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </PopupOpenScope>,
    );

    expect(getByTestId("held").textContent).toBe("false");

    act(() => getByRole("button", { name: "menu" }).click());
    expect(getByTestId("held").textContent).toBe("true");
  });

  it("reads a controlled `open` prop directly", () => {
    const { getByTestId, rerender } = render(
      <PopupOpenScope>
        {(popupOpen) => (
          <>
            <span data-testid="held">{String(popupOpen)}</span>
            {/* Controlled: base-ui fires no onOpenChange, so the mirror can
                never be the source of truth here. */}
            <DropdownMenu open={true} onOpenChange={() => {}}>
              <DropdownMenuTrigger>menu</DropdownMenuTrigger>
            </DropdownMenu>
          </>
        )}
      </PopupOpenScope>,
    );

    expect(getByTestId("held").textContent).toBe("true");

    rerender(
      <PopupOpenScope>
        {(popupOpen) => (
          <>
            <span data-testid="held">{String(popupOpen)}</span>
            <DropdownMenu open={false} onOpenChange={() => {}}>
              <DropdownMenuTrigger>menu</DropdownMenuTrigger>
            </DropdownMenu>
          </>
        )}
      </PopupOpenScope>,
    );

    expect(getByTestId("held").textContent).toBe("false");
  });
});
