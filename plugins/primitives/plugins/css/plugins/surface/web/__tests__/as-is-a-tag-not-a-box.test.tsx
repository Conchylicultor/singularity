import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Surface } from "../index";

afterEach(cleanup);

const classes = (testId: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.classList;

// `as` picks the TAG; Surface owns the BOX. A tag that brings layout of its own
// (an inline `<a>`, a content-centring `<button>`) must not change what kind
// of box the surface is — the fork cards shipped with their eyebrows on two
// baselines because a stretched `<button>` centred the shorter column.
describe("Surface: `as` is a tag choice, never a box choice", () => {
  it("is a block box by default", () => {
    render(<Surface level="raised" data-testid="s" />);
    expect(classes("s").contains("block")).toBe(true);
  });

  it("as='button' is a top-packed, left-aligned column, not a centred control", () => {
    render(<Surface level="raised" as="button" data-testid="s" />);
    const cl = classes("s");
    expect(cl.contains("flex")).toBe(true);
    expect(cl.contains("flex-col")).toBe(true);
    expect(cl.contains("text-left")).toBe(true);
    expect(cl.contains("block")).toBe(false);
  });

  it("a consumer's own display class still wins", () => {
    render(
      <Surface level="raised" as="button" className="grid" data-testid="s" />,
    );
    const cl = classes("s");
    expect(cl.contains("grid")).toBe(true);
    expect(cl.contains("flex")).toBe(false);
  });
});
