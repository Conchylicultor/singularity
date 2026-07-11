import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { PluginNode, PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { collectRenderSlotsStatic } from "./reorderable-slots-scan";

// ── Minimal fixture tree ────────────────────────────────────────────
// We don't boot the real plugin walker — we hand-build a PluginTree whose nodes
// point at on-disk fixture dirs, so the test stays a pure exercise of the static
// scanner (no barrel imports, no `node_modules`).

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

function fixtureTree(files: Record<string, { id: string; web: Record<string, string> }>): PluginTree {
  const root = mkdtempSync(join(tmpdir(), "slots-fixture-"));
  tmpDirs.push(root);
  const byDir = new Map<string, PluginNode>();
  for (const [name, spec] of Object.entries(files)) {
    const dir = join(root, name);
    const webDir = join(dir, "web");
    mkdirSync(webDir, { recursive: true });
    for (const [file, content] of Object.entries(spec.web)) {
      const p = join(webDir, file);
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, content);
    }
    const node: PluginNode = {
      dir,
      path: name,
      name,
      id: asPluginId(spec.id),
      descriptions: {},
      loadBearing: false,
      collapsed: false,
      compositionRoot: false,
      disabled: false,
      runtimes: { web: true, server: false, central: false },
      children: [],
      facets: {},
    };
    byDir.set(dir, node);
  }
  return { pluginsRoot: root, byDir, byPath: new Map(), roots: [], facets: [] };
}

const ids = (tree: PluginTree) => collectRenderSlotsStatic(tree).map((s) => s.slotId);

describe("collectRenderSlotsStatic", () => {
  test("plain literal render slots are recorded with the owning plugin id", () => {
    const tree = fixtureTree({
      shell: {
        id: "shell",
        web: {
          "slots.ts": `
            import { defineRenderSlot } from "x";
            export const Shell = {
              Sidebar: defineRenderSlot<Item>("shell.sidebar", { docLabel: (p) => p.title }),
            };
          `,
        },
      },
    });
    expect(collectRenderSlotsStatic(tree)).toEqual([
      { slotId: "shell.sidebar", pluginId: "shell" },
    ]);
  });

  test("multiline generic type args containing `=> void` and nested braces don't break the scan", () => {
    const tree = fixtureTree({
      shell: {
        id: "shell",
        web: {
          "slots.ts": `
            import { defineRenderSlot } from "x";
            export const Shell = {
              Toolbar: defineRenderSlot<{
                label?: string;
                onClick?: () => void;
                nested?: Record<string, unknown>;
              }>("shell.toolbar", { docLabel: (p) => p.label }),
            };
          `,
        },
      },
    });
    expect(ids(tree)).toEqual(["shell.toolbar"]);
  });

  test("defineDetailSections factory: call site expands to `<id>.section`", () => {
    const tree = fixtureTree({
      "detail-sections": {
        id: "primitives.detail-sections",
        web: {
          "internal/factory.tsx": `
            import { defineRenderSlot } from "x";
            export function defineDetailSections<P extends Record<string, unknown>>(id: string) {
              const Section = defineRenderSlot<P>(\`\${id}.section\`, { docLabel: (p) => p.id });
              return { Section };
            }
          `,
        },
      },
      "task-detail": {
        id: "tasks.task-detail",
        web: {
          "slots.ts": `
            import { defineDetailSections } from "x";
            export const TaskDetail = defineDetailSections<{ taskId: string }>("task-detail");
          `,
        },
      },
    });
    expect(collectRenderSlotsStatic(tree)).toEqual([
      { slotId: "task-detail.section", pluginId: "tasks.task-detail" },
    ]);
  });

  test("definePaneToolbar factory: call site expands to `.start` and `.end`", () => {
    const tree = fixtureTree({
      "pane-toolbar": {
        id: "primitives.pane-toolbar",
        web: {
          "internal/factory.tsx": `
            import { defineRenderSlot } from "x";
            export function definePaneToolbar(idBase: string) {
              const Start = defineRenderSlot<Item>(\`\${idBase}.start\`, config);
              const End = defineRenderSlot<Item>(\`\${idBase}.end\`, config);
              return { Start, End };
            }
          `,
        },
      },
      story: {
        id: "apps.story.shell",
        web: {
          "toolbar.ts": `
            import { definePaneToolbar } from "x";
            export const StoryToolbar = definePaneToolbar("story.toolbar");
          `,
        },
      },
    });
    expect(ids(tree)).toEqual(["story.toolbar.end", "story.toolbar.start"]);
  });

  test("a defineRenderSlot written inside a comment or string is NOT picked up", () => {
    const tree = fixtureTree({
      shell: {
        id: "shell",
        web: {
          "slots.ts": `
            import { defineRenderSlot } from "x";
            // defineRenderSlot("commented.out")
            const doc = "see defineRenderSlot(\\"in.a.string\\")";
            export const Real = defineRenderSlot<Item>("real.slot");
          `,
        },
      },
    });
    expect(ids(tree)).toEqual(["real.slot"]);
  });

  test("literal defineOrderedDispatchSlot call sites are recorded like render slots", () => {
    const tree = fixtureTree({
      editor: {
        id: "page.editor",
        web: {
          "slots.ts": `
            import { defineOrderedDispatchSlot } from "x";
            export const Editor = {
              Block: defineOrderedDispatchSlot<BlockRendererProps, string, BlockMeta>("page.editor.block", {
                key: (props) => props.block.type,
                fallback: UnknownBlock,
              }),
            };
          `,
        },
      },
    });
    expect(collectRenderSlotsStatic(tree)).toEqual([
      { slotId: "page.editor.block", pluginId: "page.editor" },
    ]);
  });

  test("the defineOrderedDispatchSlot wrapper DECLARATION (non-literal id) produces no entry", () => {
    const tree = fixtureTree({
      "slot-render": {
        id: "primitives.slot-render",
        web: {
          "internal/render-slot.tsx": `
            import { defineDispatchSlot } from "x";
            export function defineOrderedDispatchSlot<Props, Key extends string = string, Extra extends object = {}>(
              id: string,
              config: DispatchSlotConfig<Props, Key, Extra & { id: string }>,
            ): OrderedDispatchSlot<Props, Key, Extra> {
              return defineDispatchSlot(id, config) as unknown as OrderedDispatchSlot<Props, Key, Extra>;
            }
          `,
        },
      },
    });
    expect(collectRenderSlotsStatic(tree)).toEqual([]);
  });

  test("output is deterministic and sorted regardless of node iteration order", () => {
    const spec = {
      a: { id: "a", web: { "slots.ts": `import {defineRenderSlot} from "x"; defineRenderSlot("z.slot"); defineRenderSlot("a.slot");` } },
      b: { id: "b", web: { "slots.ts": `import {defineRenderSlot} from "x"; defineRenderSlot("m.slot");` } },
    };
    const tree = fixtureTree(spec);
    const first = collectRenderSlotsStatic(tree);
    const second = collectRenderSlotsStatic(tree);
    expect(first).toEqual(second);
    expect(first.map((s) => s.slotId)).toEqual(["a.slot", "m.slot", "z.slot"]);
  });
});
