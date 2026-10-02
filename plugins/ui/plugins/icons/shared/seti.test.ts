import { describe, expect, it } from "bun:test";
import { normalizeSetiSvg } from "./seti";

describe("normalizeSetiSvg", () => {
  it("turns every paint into currentColor and keeps none", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="none"><path d="M0 0h1" fill="#F3D400"/><path d="M1 1h1" stroke="#000"/></g></svg>',
    );
    expect(out).toEqual({
      body: '<g fill="none"><path d="M0 0h1" fill="currentColor"/><path d="M1 1h1" stroke="currentColor"/></g>',
      width: 32,
      height: 32,
    });
  });

  it("applies class rules from <style> and drops the style", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg viewBox="0 0 32 32"><style>.st0{fill:#231f20}</style><path class="st0" d="M0 0"/></svg>',
    );
    expect(out.body).toBe('<path d="M0 0" fill="currentColor"/>');
  });

  it("drops gradients (their fills become currentColor) and empty defs", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg viewBox="0 0 32 32"><defs><linearGradient id="a"><stop stop-color="#fff" offset="0"/></linearGradient></defs><path d="M0 0" fill="url(#a)"/></svg>',
    );
    expect(out.body).toBe('<path d="M0 0" fill="currentColor"/>');
  });

  it("namespaces ids that are still referenced", () => {
    const out = normalizeSetiSvg(
      "gradle",
      '<svg width="43" height="43" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path d="M0 0" id="a"/></defs><use fill="#02303A" xlink:href="#a"/></svg>',
    );
    expect(out).toEqual({
      body: '<defs><path d="M0 0" id="seti_gradle_a"/></defs><use fill="currentColor" href="#seti_gradle_a"/>',
      width: 43,
      height: 43,
    });
  });

  it("moves a non-zero viewBox origin and root presentation attributes onto a group", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg viewBox="-25 -25 110 110" fill-rule="evenodd"><path d="M0 0"/></svg>',
    );
    expect(out).toEqual({
      body: '<g fill-rule="evenodd" transform="translate(25 25)"><path d="M0 0"/></g>',
      width: 110,
      height: 110,
    });
  });

  it("throws on an element it does not know", () => {
    expect(() =>
      normalizeSetiSvg(
        "x",
        '<svg viewBox="0 0 32 32"><image href="a.png"/></svg>',
      ),
    ).toThrow(/unknown element <image>/);
  });

  it("throws on an attribute it does not know", () => {
    expect(() =>
      normalizeSetiSvg(
        "x",
        '<svg viewBox="0 0 32 32"><path d="M0 0" filter="x"/></svg>',
      ),
    ).toThrow(/unknown attribute "filter"/);
  });
});
