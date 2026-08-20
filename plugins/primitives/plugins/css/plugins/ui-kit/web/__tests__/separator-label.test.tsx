import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Separator } from "../components/ui/separator";

/**
 * The labelled rule — a centered caption with the hairline growing on both sides
 * of it. Three surfaces hand-rolled this shape out of two `h-px grow bg-border`
 * divs before it lived here; these are the two things that made it worth a
 * primitive rather than a copy: it is ONE separator (not two rules and a span),
 * and its label reaches assistive tech.
 */
afterEach(cleanup);

describe("Separator — labelled", () => {
  it("renders one separator whose accessible name is the label", () => {
    render(<Separator label="3 commits on main" />);
    const rule = screen.getByRole("separator");
    expect(rule.getAttribute("aria-label")).toBe("3 commits on main");
    expect(rule.getAttribute("aria-orientation")).toBe("horizontal");
    // The label is visible, not only announced.
    expect(rule.textContent).toBe("3 commits on main");
  });

  it("draws the rule on BOTH sides of the label, each growing to fill", () => {
    render(<Separator label="Theme" />);
    const rules = [
      ...screen.getByRole("separator").querySelectorAll("span.h-px"),
    ];
    expect(rules).toHaveLength(2);
    for (const r of rules) expect(r.className).toContain("grow");
  });

  it("is still a plain empty rule without a label", () => {
    render(<Separator />);
    const rule = screen.getByRole("separator");
    expect(rule.textContent).toBe("");
    expect(rule.hasAttribute("aria-label")).toBe(false);
  });
});
