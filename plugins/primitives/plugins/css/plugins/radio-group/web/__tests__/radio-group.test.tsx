import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { RadioGroup } from "../index";

/**
 * The invariant under test is the `name` attribute, because that — and nothing
 * else — is what makes two radio groups independent in the browser. A test that
 * only asserted "clicking calls onChange" would pass just as happily against the
 * shared-literal version this primitive replaced, since the collision lives in
 * native grouping rather than in React state.
 */

const SIZE = [
  { value: "sm", label: "Small" },
  { value: "lg", label: "Large" },
] as const;

const TONE = [
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
] as const;

function TwoGroups() {
  const [size, setSize] = useState("sm");
  const [tone, setTone] = useState("warm");
  return (
    <>
      <div data-testid="size">
        <RadioGroup options={SIZE} value={size} onChange={setSize} />
      </div>
      <div data-testid="tone">
        <RadioGroup options={TONE} value={tone} onChange={setTone} />
      </div>
    </>
  );
}

function namesIn(testid: string): string[] {
  const scope = screen.getByTestId(testid);
  return [...scope.querySelectorAll("input[type=radio]")].map(
    (el) => (el as HTMLInputElement).name,
  );
}

afterEach(cleanup);

describe("RadioGroup", () => {
  it("gives every radio in one group the same name", () => {
    render(<TwoGroups />);
    const [a, b] = namesIn("size");
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("gives two mounted groups different names", () => {
    render(<TwoGroups />);
    // The whole point: same component, same page, distinct native groups. A
    // hardcoded `name` would make these equal and silently merge the two.
    expect(namesIn("size")[0]).not.toBe(namesIn("tone")[0]);
  });

  it("keeps each group's native checked state independent", () => {
    render(<TwoGroups />);
    const large = screen.getByLabelText("Large") as HTMLInputElement;
    const warm = screen.getByLabelText("Warm") as HTMLInputElement;

    expect(warm.checked).toBe(true);
    large.click();

    // Under a shared name the browser would have cleared `warm` when `large`
    // was selected, because both would belong to one native group.
    expect(large.checked).toBe(true);
    expect(warm.checked).toBe(true);
  });

  it("selects at most one option within a group", () => {
    render(<TwoGroups />);
    const small = screen.getByLabelText("Small") as HTMLInputElement;
    const large = screen.getByLabelText("Large") as HTMLInputElement;

    expect(small.checked).toBe(true);
    large.click();
    expect(large.checked).toBe(true);
    expect(small.checked).toBe(false);
  });

  it("checks nothing when the value matches no option", () => {
    render(<RadioGroup options={SIZE} value="nope" onChange={() => {}} />);
    for (const el of screen.getAllByRole("radio")) {
      expect((el as HTMLInputElement).checked).toBe(false);
    }
  });
});
