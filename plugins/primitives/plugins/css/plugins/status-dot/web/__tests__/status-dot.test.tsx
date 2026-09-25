import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { StatusDot, statusDotPaintClass } from "../internal/status-dot";

afterEach(cleanup);

function dot(ui: ReactElement): Element {
  return render(ui).container.firstElementChild!;
}

describe("StatusDot paint", () => {
  it("fills with the colour class", () => {
    const el = dot(<StatusDot colorClass="bg-success" />);
    expect(el.classList.contains("bg-success")).toBe(true);
    expect(el.classList.contains("border")).toBe(false);
  });

  it("draws a hollow 1px ring with the ring class", () => {
    const el = dot(<StatusDot ringClass="border-warning" />);
    expect(el.classList.contains("border")).toBe(true);
    expect(el.classList.contains("border-warning")).toBe(true);
    expect(el.classList.contains("bg-transparent")).toBe(true);
  });

  it("gives a surface drawing its own dot the same classes", () => {
    expect(statusDotPaintClass({ colorClass: "bg-info" })).toBe("bg-info");
    expect(statusDotPaintClass({ ringClass: "border-warning" })).toBe(
      "border bg-transparent border-warning",
    );
  });

  it("rejects a dot that is both filled and hollow", () => {
    // @ts-expect-error — the paint is one arm or the other, never both.
    dot(<StatusDot colorClass="bg-info" ringClass="border-warning" />);
  });
});

describe("StatusDot size", () => {
  it("reads the density tier's status-dot token", () => {
    expect(
      dot(<StatusDot colorClass="bg-info" />).classList.contains(
        "size-status-dot-md",
      ),
    ).toBe(true);
    const xs = dot(
      <ControlSizeProvider size="xs">
        <StatusDot ringClass="border-warning" />
      </ControlSizeProvider>,
    );
    expect(xs.classList.contains("size-status-dot-xs")).toBe(true);
  });
});
