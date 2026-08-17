import { afterEach, describe, expect, it } from "vitest";
import {
  assertViewportEscape,
  findViewportBlocker,
} from "../internal/assert-viewport-escape";

// The ancestor walk that keeps solo (fullscreen) honest. It exists because the
// two things a `fixed inset-0` tab needs — the viewport as its containing block,
// and the root stacking context to compare its z-index in — are properties of
// elements in OTHER plugins, and both fail silently enough to survive review.
//
// jsdom has no layout engine, but it does compute every property this walk reads
// (transform, filter, contain, will-change, container-type, opacity, isolation,
// mix-blend-mode, position, z-index), so inline styles here exercise the real
// decision rather than a stand-in for it. What jsdom cannot show is the SYMPTOM
// — that the box is genuinely clipped or genuinely painted under the rail. That
// is the e2e's job (`e2e/solo-keepalive.ts`).

/** backdrop ← mid ← outer ← body. Returns the backdrop we measure from. */
function buildChain(): {
  backdrop: HTMLElement;
  mid: HTMLElement;
  outer: HTMLElement;
} {
  const outer = document.createElement("div");
  const mid = document.createElement("div");
  const backdrop = document.createElement("div");
  outer.appendChild(mid);
  mid.appendChild(backdrop);
  document.body.appendChild(outer);
  return { backdrop, mid, outer };
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");
});

describe("findViewportBlocker: the containing-block half", () => {
  it("reports a clear chain as null", () => {
    const { backdrop } = buildChain();
    expect(findViewportBlocker(backdrop)).toBeNull();
  });

  it.each([
    ["transform", "translateZ(0)"],
    ["filter", "blur(1px)"],
    ["backdrop-filter", "blur(2px)"],
    ["perspective", "100px"],
    ["scale", "1.5"],
    ["will-change", "transform"],
    ["contain", "paint"],
    ["container-type", "inline-size"],
  ])("flags an ancestor's %s as a containing block", (property, value) => {
    const { backdrop, mid } = buildChain();
    mid.style.setProperty(property, value);

    const blocker = findViewportBlocker(backdrop);
    expect(blocker?.element).toBe(mid);
    expect(blocker?.reason).toBe("containing-block");
    expect(blocker?.property).toBe(property);
  });

  it("flags the backdrop's OWN transform — the one the surface must drop", () => {
    const { backdrop } = buildChain();
    // Exactly the failure mode of forgetting to make `transform-gpu` conditional.
    backdrop.style.setProperty("transform", "translateZ(0)");

    const blocker = findViewportBlocker(backdrop);
    expect(blocker?.element).toBe(backdrop);
    expect(blocker?.reason).toBe("containing-block");
  });

  it("flags a transform on <html>, which really does capture fixed boxes", () => {
    const { backdrop } = buildChain();
    document.documentElement.style.setProperty("transform", "translateZ(0)");

    const blocker = findViewportBlocker(backdrop);
    expect(blocker?.element).toBe(document.documentElement);
    expect(blocker?.reason).toBe("containing-block");
  });
});

describe("findViewportBlocker: the stacking-context half", () => {
  it.each([
    ["opacity", "0.5"],
    ["isolation", "isolate"],
    ["mix-blend-mode", "multiply"],
    ["position", "sticky"],
  ])("flags an ancestor's %s as a stacking context", (property, value) => {
    const { backdrop, mid } = buildChain();
    mid.style.setProperty(property, value);

    const blocker = findViewportBlocker(backdrop);
    expect(blocker?.element).toBe(mid);
    expect(blocker?.reason).toBe("stacking-context");
    expect(blocker?.property).toBe(property);
  });

  it("flags a positioned ancestor with a numeric z-index", () => {
    const { backdrop, mid } = buildChain();
    mid.style.setProperty("position", "relative");
    mid.style.setProperty("z-index", "5");

    const blocker = findViewportBlocker(backdrop);
    expect(blocker?.element).toBe(mid);
    expect(blocker?.reason).toBe("stacking-context");
    expect(blocker?.property).toBe("z-index");
  });

  it("lets a plain positioned ancestor through — `relative` alone stacks nothing", () => {
    const { backdrop, mid } = buildChain();
    // The surface backdrop itself is exactly this, and it must stay legal.
    mid.style.setProperty("position", "relative");

    expect(findViewportBlocker(backdrop)).toBeNull();
  });

  it("does not flag <html>, which IS the root stacking context", () => {
    const { backdrop } = buildChain();
    document.documentElement.style.setProperty("opacity", "0.5");

    // A solo tab and every body-portaled popover already live in it together, so
    // there is nothing here for a fullscreen box to be trapped inside of.
    expect(findViewportBlocker(backdrop)).toBeNull();
  });
});

describe("findViewportBlocker: what it skips and which it picks", () => {
  it("ignores a `display: contents` element, which generates no box at all", () => {
    const { backdrop, mid } = buildChain();
    mid.style.setProperty("display", "contents");
    mid.style.setProperty("transform", "translateZ(0)");
    mid.style.setProperty("opacity", "0.5");

    expect(findViewportBlocker(backdrop)).toBeNull();
  });

  it("reports the NEAREST blocker, so the message names the one to fix first", () => {
    const { backdrop, mid, outer } = buildChain();
    outer.style.setProperty("transform", "translateZ(0)");
    mid.style.setProperty("opacity", "0.5");

    expect(findViewportBlocker(backdrop)?.element).toBe(mid);
  });

  it("reports the containing-block break for a property that causes both", () => {
    const { backdrop, mid } = buildChain();
    // A transform opens a stacking context too; the clipped geometry is the
    // louder symptom, so that is the one the message leads with.
    mid.style.setProperty("transform", "translateZ(0)");

    expect(findViewportBlocker(backdrop)?.reason).toBe("containing-block");
  });
});

describe("assertViewportEscape", () => {
  it("says nothing when the chain is clear", () => {
    const { backdrop } = buildChain();
    expect(() => assertViewportEscape(backdrop)).not.toThrow();
  });

  it("throws in dev, naming the element, the property and the symptom", () => {
    const { backdrop, mid } = buildChain();
    mid.className = "fixture-mid";
    mid.style.setProperty("transform", "translateZ(0)");

    // Everything a reader needs to act: which element, which declaration, and
    // what they are about to see on screen.
    expect(() => assertViewportEscape(backdrop)).toThrow(/div\.fixture-mid/);
    expect(() => assertViewportEscape(backdrop)).toThrow(/transform/);
    expect(() => assertViewportEscape(backdrop)).toThrow(/clipped/);
  });

  it("names the coverage symptom for a stacking-context break", () => {
    const { backdrop, mid } = buildChain();
    mid.style.setProperty("isolation", "isolate");

    expect(() => assertViewportEscape(backdrop)).toThrow(/stacking context/);
    expect(() => assertViewportEscape(backdrop)).toThrow(/app rail/);
  });
});
