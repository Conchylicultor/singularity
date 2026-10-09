import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  DividerReorderItem,
  ReorderAreaContext,
  type ReorderAreaCtxValue,
} from "../internal/items";

afterEach(cleanup);

function area(orientation: ReorderAreaCtxValue["orientation"]) {
  return { orientation, onHide: () => {}, onRemoveNode: () => {} };
}

describe("a divider turns its rule to the area's flow", () => {
  it("draws a flat rule on the rail in a vertical area", () => {
    const { getByRole } = render(
      <ReorderAreaContext.Provider value={area("vertical")}>
        <DividerReorderItem itemKey="d" editMode={false} />
      </ReorderAreaContext.Provider>,
    );
    const sep = getByRole("separator");
    expect(sep.getAttribute("aria-orientation")).toBeNull();
    expect(sep.className).toContain("rail-follow");
    expect(sep.firstElementChild!.className).toContain("border-t");
  });

  it("defaults to the flat rule outside any area", () => {
    const { getByRole } = render(
      <DividerReorderItem itemKey="d" editMode={false} />,
    );
    expect(getByRole("separator").firstElementChild!.className).toContain(
      "border-t",
    );
  });

  it("draws an upright rule sized from the row's control height in a horizontal area", () => {
    const { getByRole } = render(
      <ReorderAreaContext.Provider value={area("horizontal")}>
        <ControlSizeProvider size="md">
          <DividerReorderItem itemKey="d" editMode={false} />
        </ControlSizeProvider>
      </ReorderAreaContext.Provider>,
    );
    const sep = getByRole("separator");
    expect(sep.getAttribute("aria-orientation")).toBe("vertical");
    const rule = sep.firstElementChild as HTMLElement;
    expect(rule.className).toContain("border-l");
    expect(rule.style.height).toContain("--control-height-md");
  });
});
