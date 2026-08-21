import { describe, expect, test } from "bun:test";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { SlotHandle } from "./declaration";
import { declarePluginSlots } from "./declaration";

// A slot stood up by hand rather than by `defineSlot`: that constructor lives in
// `web-sdk`, which imports React and depends on THIS plugin, so a test here
// cannot reach for it. `isSlot` is the whole contract — a callable carrying
// `meta` and `useContributions` — and these fixtures satisfy it exactly, which
// is what `collectSlots` reads.
function makeSlot(): SlotHandle {
  const slot = (() => null) as unknown as SlotHandle & {
    useContributions: () => void;
  };
  slot.meta = { kind: "slot", reorderable: false };
  slot.useContributions = () => {};
  return slot;
}

describe("SlotNaming", () => {
  // THE POINT OF THE WHOLE CHANGE. A naming answers for its own pass, so a later
  // pass over a wider plugin set cannot retroactively widen an earlier answer.
  // Read off the process-global `_pluginId` / `_key` stamps — which are written
  // by every pass and never cleared — this test fails, and with it the property
  // that lets concurrently-running checks cache their verdicts.
  test("a pass's answers are its own, even after a wider pass has run", () => {
    const enabledSlot = makeSlot();
    const disabledSlot = makeSlot();
    const enabled = {
      id: asPluginId("enabled.plugin"),
      slots: { thing: enabledSlot },
    };
    const disabled = {
      id: asPluginId("disabled.plugin"),
      slots: { thing: disabledSlot },
    };

    const registry = declarePluginSlots([enabled], "registry");
    const source = declarePluginSlots([enabled, disabled], "source");

    // The wider pass names it, and has stamped it globally in doing so.
    expect(source.idOf(disabledSlot)).toEqual({
      kind: "named",
      id: "disabled.plugin.thing",
      pluginId: asPluginId("disabled.plugin"),
      key: "thing",
    });
    expect(disabledSlot._pluginId).toBe(asPluginId("disabled.plugin"));

    // The narrower pass still does not, and says which scope it is answering in.
    expect(registry.idOf(disabledSlot)).toEqual({
      kind: "out-of-scope",
      scope: "registry",
    });
    expect(registry.findSlot("disabled.plugin.thing")).toBeUndefined();
    expect(registry.declarations().map((e) => e.id)).toEqual([
      "enabled.plugin.thing",
    ]);
  });

  test("slotNamed throws on an id this pass did not settle, naming it", () => {
    const naming = declarePluginSlots(
      [{ id: asPluginId("some.plugin"), slots: { thing: makeSlot() } }],
      "registry",
    );

    expect(naming.slotNamed("some.plugin.thing")).toBe(
      naming.declarations()[0]!.slot,
    );
    expect(() => naming.slotNamed("some.plugin.gone")).toThrow(
      /some\.plugin\.gone/,
    );
    // The scope is in the message too: "not declared here" is only actionable
    // once the reader knows which plugin set "here" was.
    expect(() => naming.slotNamed("some.plugin.gone")).toThrow(/registry/);
    // The probe form of the same question does not throw — a check that threw
    // would abort every other check's reporting.
    expect(naming.findSlot("some.plugin.gone")).toBeUndefined();
  });

  test("declarations() is exactly this pass's set, and idOf agrees with it", () => {
    const sidebar = makeSlot();
    const toolbar = makeSlot();
    const other = makeSlot();
    const naming = declarePluginSlots(
      [
        {
          id: asPluginId("app.shell"),
          slots: { sidebar, TabBarActions: toolbar },
        },
        { id: asPluginId("app.other"), slots: { thing: other } },
      ],
      "registry",
    );

    expect(naming.declarations()).toEqual([
      {
        slot: sidebar,
        id: "app.shell.sidebar",
        pluginId: asPluginId("app.shell"),
        key: "sidebar",
      },
      {
        slot: toolbar,
        id: "app.shell.tab-bar-actions",
        pluginId: asPluginId("app.shell"),
        key: "tab-bar-actions",
      },
      {
        slot: other,
        id: "app.other.thing",
        pluginId: asPluginId("app.other"),
        key: "thing",
      },
    ]);

    for (const entry of naming.declarations()) {
      expect(naming.idOf(entry.slot)).toEqual({
        kind: "named",
        id: `${entry.pluginId}.${entry.key}`,
        pluginId: entry.pluginId,
        key: entry.key,
      });
      expect(naming.slotNamed(entry.id)).toBe(entry.slot);
    }

    // The owners map every existing consumer reads is the same set.
    expect([...naming.owners]).toEqual([
      ["app.shell.sidebar", asPluginId("app.shell")],
      ["app.shell.tab-bar-actions", asPluginId("app.shell")],
      ["app.other.thing", asPluginId("app.other")],
    ]);
  });

  test("a plugin declared twice in one pass settles one declaration", () => {
    // How the facet tree calls it: one record per imported MODULE, so a plugin
    // whose web and server barrels both declare pushes the same slots twice.
    const slot = makeSlot();
    const plugin = { id: asPluginId("dup.plugin"), slots: { thing: slot } };
    const naming = declarePluginSlots([plugin, plugin], "source");

    expect(naming.declarations()).toHaveLength(1);
    expect(naming.slotNamed("dup.plugin.thing")).toBe(slot);
  });
});
