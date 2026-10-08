import { describe, expect, it } from "vitest";
import { flowAxis, layoutHost } from "../internal/layout-host";

function el(style: string, ...children: Element[]): HTMLElement {
  const e = document.createElement("div");
  e.setAttribute("style", style);
  for (const c of children) e.appendChild(c);
  return e;
}

describe("layoutHost", () => {
  it("is the direct parent when it draws a box", () => {
    const node = el("");
    const parent = el("display: flex", node);
    expect(layoutHost(node)).toBe(parent);
  });

  it("skips display: contents wrappers", () => {
    const node = el("");
    const host = el(
      "display: flex; flex-direction: column",
      el("display: contents", el("display: contents", node)),
    );
    expect(layoutHost(node)).toBe(host);
  });

  it("is null for a detached node", () => {
    expect(layoutHost(el(""))).toBeNull();
  });
});

describe("flowAxis", () => {
  it("is row for a row flex container", () => {
    expect(flowAxis(el("display: flex"))).toBe("row");
    expect(
      flowAxis(el("display: inline-flex; flex-direction: row-reverse")),
    ).toBe("row");
  });

  it("is column for a column flex container", () => {
    expect(flowAxis(el("display: flex; flex-direction: column"))).toBe(
      "column",
    );
  });

  it("is column for a non-flex box, whatever its flex-direction", () => {
    expect(flowAxis(el("display: block; flex-direction: row"))).toBe("column");
    expect(flowAxis(el("display: contents"))).toBe("column");
  });
});
