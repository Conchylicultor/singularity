import { describe, expect, it } from "bun:test";
import { normalizeSetiSvg } from "./seti";

describe("normalizeSetiSvg", () => {
  it("turns every paint into currentColor and keeps none", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="none"><path d="M2 4h15v15h-15z" fill="#F3D400"/><path d="M4 6h1" stroke="#000"/></g></svg>',
    );
    expect(out).toEqual({
      body: '<g transform="translate(-0.5 -2.5)"><g fill="none"><path d="M2 4h15v15h-15z" fill="currentColor"/><path d="M4 6h1" stroke="currentColor"/></g></g>',
      width: 18,
      height: 18,
    });
  });

  it("applies class rules from <style> and drops the style", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg viewBox="0 0 32 32"><style>.st0{fill:#231f20}</style><path class="st0" d="M0 0h30v30H0z"/></svg>',
    );
    expect(out.body).toBe(
      '<g transform="translate(3 3)"><path d="M0 0h30v30H0z" fill="currentColor"/></g>',
    );
  });

  it("drops gradients (their fills become currentColor) and empty defs", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg viewBox="0 0 32 32"><defs><linearGradient id="a"><stop stop-color="#fff" offset="0"/></linearGradient></defs><path d="M0 0h30v30H0z" fill="url(#a)"/></svg>',
    );
    expect(out.body).toBe(
      '<g transform="translate(3 3)"><path d="M0 0h30v30H0z" fill="currentColor"/></g>',
    );
  });

  it("namespaces ids that are still referenced, and measures a <use> where it is drawn", () => {
    const out = normalizeSetiSvg(
      "gradle",
      '<svg width="43" height="43" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path d="M0 0h15v15H0z" id="a"/></defs><use fill="#02303A" xlink:href="#a" x="5" y="5"/></svg>',
    );
    expect(out).toEqual({
      body: '<g transform="translate(-3.5 -3.5)"><defs><path d="M0 0h15v15H0z" id="seti_gradle_a"/></defs><use fill="currentColor" href="#seti_gradle_a" x="5" y="5"/></g>',
      width: 18,
      height: 18,
    });
  });

  it("moves root presentation attributes onto the group that carries the crop", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg viewBox="-25 -25 110 110" fill-rule="evenodd"><path d="M0 0h30v30H0z"/></svg>',
    );
    expect(out).toEqual({
      body: '<g fill-rule="evenodd" transform="translate(3 3)"><path d="M0 0h30v30H0z"/></g>',
      width: 36,
      height: 36,
    });
  });

  it("crops to a centred square around what is painted, ignoring unpainted shapes", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6"/><rect x="0" y="0" width="32" height="32" fill="none"/></svg>',
    );
    // 12 units of glyph, a 1/12 margin each side: a 14.4 box from 8.8.
    expect(out).toEqual({
      body: '<g transform="translate(-8.8 -8.8)"><circle cx="16" cy="16" r="6"/><rect x="0" y="0" width="32" height="32" fill="none"/></g>',
      width: 14.4,
      height: 14.4,
    });
  });

  it("keeps a wide glyph's aspect: the square follows the long side, centred on the short one", () => {
    const out = normalizeSetiSvg(
      "x",
      '<svg viewBox="0 0 32 32"><path d="M1 10h30v5H1z"/></svg>',
    );
    expect(out.width).toBe(36);
    expect(out.height).toBe(36);
    // 30 wide → a 36 square; the 5-high bar sits in its middle.
    expect(out.body).toBe(
      '<g transform="translate(2 5.5)"><path d="M1 10h30v5H1z"/></g>',
    );
  });

  it("throws on a glyph that paints nothing", () => {
    expect(() =>
      normalizeSetiSvg(
        "x",
        '<svg viewBox="0 0 32 32"><path d="M0 0h4v4H0z" fill="none"/></svg>',
      ),
    ).toThrow(/paints nothing/);
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
