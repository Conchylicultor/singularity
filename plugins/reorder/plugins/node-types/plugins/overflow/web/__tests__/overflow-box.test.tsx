import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MdClose } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { OverflowBox } from "../components/overflow-box";

// The bucket's members are AUTHORED in config, but each one decides per row
// whether it applies (an item action returns null on a row it has nothing to do
// with). So "has members" and "will render something" are different questions,
// and only the second may paint a `⋯`: a trigger opening an empty menu is a dead
// affordance. These assert the second question is the one being asked.

afterEach(cleanup);

/** An action that does not apply to this row — the shape every item action takes. */
function NotApplicable() {
  return null;
}

function Applicable() {
  return <IconButton icon={MdClose} label="Close conversation" />;
}

const TRIGGER = 'button[aria-label="More"]';

describe("OverflowBox", () => {
  it("paints no ⋯ when every member renders nothing", () => {
    const { container } = render(
      <OverflowBox payload={{}} editMode={false}>
        <NotApplicable />
        <NotApplicable />
      </OverflowBox>,
    );

    expect(container.querySelector(TRIGGER)).toBeNull();
  });

  it("paints the ⋯ when at least one member renders", () => {
    const { container } = render(
      <OverflowBox payload={{}} editMode={false}>
        <NotApplicable />
        <Applicable />
      </OverflowBox>,
    );

    expect(container.querySelector(TRIGGER)).not.toBeNull();
  });

  it("draws no DOM for the probe pass — the members are counted, not painted", () => {
    const { container } = render(
      <OverflowBox payload={{}} editMode={false}>
        <Applicable />
      </OverflowBox>,
    );

    // One button in the closed box: the trigger. The probed member must not have
    // left a second (invisible or otherwise) copy of itself on the row.
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("renders nothing at all with no authored members", () => {
    const { container } = render(
      <OverflowBox payload={{}} editMode={false}>
        {[]}
      </OverflowBox>,
    );

    expect(container.innerHTML).toBe("");
  });
});
