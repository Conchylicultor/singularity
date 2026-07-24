import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  renderReorderableSlotsManifest,
  reorderableSlotsManifestPath,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// One manifest row, as `renderManifest` emits it. Parsing the two strings this
// check ALREADY holds is what makes the added-slot report free — there is no
// second scan, no barrel import, and no second source of truth for the set.
const ENTRY_RE = /\{ slotId: "([^"]+)", pluginId: "([^"]+)" \}/g;

function parseSlots(manifest: string): { slotId: string; pluginId: string }[] {
  return [...manifest.matchAll(ENTRY_RE)].map((m) => ({
    slotId: m[1]!,
    pluginId: m[2]!,
  }));
}

// The override a reorderable slot owes, at the path config_v2 derives for it:
// the slash form of the DEFINING plugin's id (reorder plants the directive under
// that plugin's hierarchy via the `pluginId` override) joined with the literal
// slotId. `./singularity build` SEEDS this file — naming it here is the
// zero-build heads-up, so `./singularity check` on a tree that has never been
// built still says exactly which file is about to appear.
function overridePathFor(pluginId: string, slotId: string): string {
  return `config/${asPath(asPluginId(pluginId))}/${slotId}.jsonc`;
}

const check: Check = {
  id: "reorderable-slots-in-sync",
  description:
    "plugins/reorder/shared/reorderable-slots.generated.ts matches the current reorderable render slots",
  async run() {
    const root = await getWorktreeRoot();
    const file = reorderableSlotsManifestPath(root);
    const rel = relative(root, file);
    if (!existsSync(file)) {
      return {
        ok: false,
        message: `${rel} is missing`,
        hint: "Run `./singularity build` to generate it.",
      };
    }
    const committed = readFileSync(file, "utf8");
    const rendered = await renderReorderableSlotsManifest(root);
    if (committed !== rendered) {
      const committedIds = new Set(parseSlots(committed).map((s) => s.slotId));
      const added = parseSlots(rendered).filter(
        (s) => !committedIds.has(s.slotId),
      );
      const owed =
        added.length === 0
          ? ""
          : `\n\n${added.length} newly reorderable slot(s) will each owe an authored config override:\n` +
            added
              .map((s) => `    ${overridePathFor(s.pluginId, s.slotId)}`)
              .join("\n");
      return {
        ok: false,
        message: `${rel} is out of sync with the reorderable render slots${owed}`,
        hint:
          "Run `./singularity build` and commit the regenerated file." +
          (added.length > 0
            ? " The build also SEEDS each override listed above (real hash, full" +
              " catalog) with a `// @review` marker: arrange its `items` for how" +
              " the slot renders, then delete that marker line" +
              " (`config:overrides-authored` fails until you do). If a listed slot's" +
              " order should never be user-curated, it is headless — declare it with" +
              " `defineMountSlot` instead of `defineRenderSlot`."
            : ""),
      };
    }
    return { ok: true };
  },
};

export default check;
