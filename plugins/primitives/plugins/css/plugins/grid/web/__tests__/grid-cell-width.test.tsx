import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";

afterEach(cleanup);

function root(container: HTMLElement): HTMLElement {
  const el = container.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error("Grid rendered no element");
  return el;
}

describe("Grid cellWidth path", () => {
  it("lays exact-width tracks and centres the row", () => {
    const { container } = render(<Grid cellWidth="116px">x</Grid>);
    const el = root(container);
    expect(el.style.gridTemplateColumns).toBe("repeat(auto-fill, 116px)");
    expect(el.classList).toContain("justify-center");
  });

  it("the responsive path is unchanged and uncentred", () => {
    const { container } = render(<Grid minCellWidth="12rem">x</Grid>);
    const el = root(container);
    expect(el.style.gridTemplateColumns).toBe(
      "repeat(auto-fill, minmax(12rem, 1fr))",
    );
    expect(el.classList).not.toContain("justify-center");
  });
});
