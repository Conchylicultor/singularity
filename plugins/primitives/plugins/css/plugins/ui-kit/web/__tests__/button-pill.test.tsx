import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  Button,
  ButtonGroup,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

afterEach(cleanup);

function groupClass(container: HTMLElement): string {
  const group = container.firstElementChild;
  if (!group) throw new Error("ButtonGroup rendered no element");
  return group.className;
}

// jsdom evaluates no stylesheet, so these pin the class contract the pill
// padding rides on; the computed widths are verified against a real browser in
// apps/website/plugins/shell/e2e/site-chrome-verify.ts.
describe("pill padding", () => {
  it("a pill button declares both ends rounded, beside its size's padding", () => {
    const { getByRole } = render(<Button shape="pill">Improve</Button>);
    const cls = getByRole("button").className;
    expect(cls).toContain("pill-ends");
    expect(cls).toContain("px-control-md");
  });

  it("a rectangular button declares no rounded end", () => {
    const { getByRole } = render(<Button>Save</Button>);
    expect(getByRole("button").className).not.toContain("pill-");
  });

  it("a split pill declares only its outer ends rounded", () => {
    const { container } = render(
      <ButtonGroup shape="pill">
        <Button>Improve</Button>
        <Button aspect="icon" aria-label="Pick" />
      </ButtonGroup>,
    );
    const cls = groupClass(container);
    expect(cls).toContain(
      "[&>:nth-child(1_of_:not([data-base-ui-focus-guard]))]:pill-start",
    );
    expect(cls).toContain(
      "[&>:nth-last-child(1_of_:not([data-base-ui-focus-guard]))]:pill-end",
    );
  });

  it("a plain group declares no rounded end", () => {
    const { container } = render(
      <ButtonGroup>
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>,
    );
    expect(groupClass(container)).not.toContain("pill-");
  });
});
