import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { CollapsedViewSwitcher } from "../components/collapsed-view-switcher";
import type { ResolvedViewInstance } from "../internal/resolve-instances";
import type { ViewActionsCore } from "../internal/use-view-model";
import type { ViewTypeMeta } from "../../core";

/**
 * The collapsed switcher's two trigger shapes open ONE menu: `appearance`
 * changes the trigger, never what it offers.
 */

const Icon: ComponentType<{ className?: string }> = () => null;

function inst(id: string): ResolvedViewInstance<ViewTypeMeta> {
  return {
    instance: { id, name: id, type: "list" },
    viewType: { type: "list", title: "List", icon: Icon },
  } as unknown as ResolvedViewInstance<ViewTypeMeta>;
}

const INSTANCES = [inst("Queue"), inst("Models"), inst("History")];

const ACTIONS = { availableSources: [] } as unknown as ViewActionsCore;

function openMenu(appearance?: "chip" | "row") {
  const onSelect = vi.fn();
  render(
    <CollapsedViewSwitcher
      instances={INSTANCES}
      activeId="Queue"
      onSelect={onSelect}
      actions={ACTIONS}
      appearance={appearance}
    />,
  );
  const trigger = screen.getByRole("button", { name: "View: Queue" });
  act(() => trigger.click());
  const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
  return { trigger, items, onSelect };
}

afterEach(cleanup);

describe("CollapsedViewSwitcher — appearance", () => {
  it("chip (default): a pill trigger", () => {
    const { trigger } = openMenu();
    expect(trigger.className).toContain("rounded-full");
  });

  it("row: a full-width row trigger whose chevron hides at rest", () => {
    render(
      <CollapsedViewSwitcher
        instances={INSTANCES}
        activeId="Queue"
        onSelect={() => {}}
        actions={ACTIONS}
        appearance="row"
      />,
    );
    const trigger = screen.getByRole("button", { name: "View: Queue" });
    expect(trigger.tagName.toLowerCase()).toBe("button");
    expect(trigger.className).toContain("w-full");
    expect(trigger.className).not.toContain("rounded-full");
    const chevron = trigger.querySelector("svg");
    expect(chevron?.getAttribute("class")).toContain("opacity-0");
  });

  it("row: offers exactly the chip's menu, and holds the chevron while open", () => {
    const chip = openMenu("chip").items;
    cleanup();
    const { trigger, items, onSelect } = openMenu("row");
    expect(items).toEqual(chip);
    expect(items).toEqual(["Models", "History", "Add view", "View settings…"]);
    expect(trigger.querySelector("svg")?.getAttribute("class")).toContain(
      "opacity-100",
    );
    act(() => screen.getByRole("menuitem", { name: "Models" }).click());
    expect(onSelect).toHaveBeenCalledWith("Models");
  });
});
