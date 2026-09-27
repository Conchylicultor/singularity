import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "../internal/badge";

afterEach(cleanup);

// A chip's words are the `tag` role: `text-tag font-tag` at the comfortable
// densities, the tag role's own compact rung at `xs` — never a component-named
// chip token.
describe("Badge — wears the tag role", () => {
  it("reads text-tag + font-tag at the default density", () => {
    const { container } = render(<Badge>label</Badge>);
    const cls = [...container.firstElementChild!.classList];
    expect(cls).toEqual(
      expect.arrayContaining(["p-chip", "text-tag", "font-tag", "rounded-md"]),
    );
  });

  it("steps down to text-tag-compact at xs, keeping the tag weight", () => {
    const { container } = render(
      <ControlSizeProvider size="xs">
        <Badge>3</Badge>
      </ControlSizeProvider>,
    );
    const cls = [...container.firstElementChild!.classList];
    expect(cls).toEqual(
      expect.arrayContaining([
        "p-chip-compact",
        "text-tag-compact",
        "font-tag",
        "rounded-chip-compact",
      ]),
    );
    expect(cls).not.toContain("text-tag");
  });
});
