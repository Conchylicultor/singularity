import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { AddViewMenuItems } from "../components/add-view-menu-items";
import type { ViewActionsCore } from "../internal/use-view-model";
import type { AddableSource } from "../../core";

/**
 * The add-view rows both switchers share: one untitled source is a flat list,
 * several sources are one labelled section each — and a click adds the type
 * under the source it was listed in.
 */

const Icon: ComponentType<{ className?: string }> = () => null;

function actionsWith(sources: AddableSource[]) {
  const addView = vi.fn();
  return {
    addView,
    actions: {
      availableSources: sources,
      addView,
    } as unknown as ViewActionsCore,
  };
}

function renderOpen(actions: ViewActionsCore) {
  return render(
    <DropdownMenu open onOpenChange={() => {}}>
      <DropdownMenuTrigger>menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <AddViewMenuItems actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

afterEach(cleanup);

describe("AddViewMenuItems", () => {
  it("lists one untitled source flat, with no section label", () => {
    const { actions, addView } = actionsWith([
      {
        sourceId: undefined,
        title: undefined,
        types: [
          { type: "list", title: "List", icon: Icon },
          { type: "table", title: "Table", icon: Icon },
        ],
      } as unknown as AddableSource,
    ]);
    renderOpen(actions);

    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["List", "Table"]);
    expect(screen.queryByRole("group")).toBeNull();

    items[1]!.click();
    expect(addView).toHaveBeenCalledWith("table");
  });

  it("lists several sources as one labelled section each", () => {
    const { actions, addView } = actionsWith([
      {
        sourceId: "queue",
        title: "Queue",
        types: [{ type: "list", title: "List", icon: Icon }],
      },
      {
        sourceId: "history",
        title: "History",
        types: [{ type: "table", title: "Table", icon: Icon }],
      },
    ] as unknown as AddableSource[]);
    renderOpen(actions);

    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(groups[0]!.textContent).toContain("Queue");
    expect(groups[1]!.textContent).toContain("History");

    within(groups[1]!).getByRole("menuitem").click();
    expect(addView).toHaveBeenCalledWith("table", "history");
  });
});
