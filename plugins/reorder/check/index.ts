import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { Check } from "@plugins/framework/plugins/tooling/core";
import { reorderableSlots } from "../shared/reorderable-slots.generated";
import { grandfatheredSlots } from "./grandfathered-slots";

// A reorder directive descriptor is stored under
// `config/<asPath(pluginId)>/<slotId>.jsonc` — the slash form of the DEFINING
// plugin's id (reorder plants the descriptor under that plugin's hierarchy via
// the `pluginId` override) joined with the literal slotId. Mirror the store
// path exactly: convert the pluginId through `asPath`, keep the slotId verbatim.
function overridePathFor(pluginId: string, slotId: string): string {
  return `config/${asPath(asPluginId(pluginId))}/${slotId}.jsonc`;
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const check: Check = {
  id: "reorder:configs-authored",
  description:
    "Every reorderable slot must have an authored config override (grandfathered slots are exempt until one is written)",
  // Cheap (one `git ls-files` + the generated manifest) and codegen-coupled:
  // making a slot reorderable is what creates the obligation, so fail at build
  // — including `--skip-checks` builds — not only at push.
  alwaysRun: true,
  // Never cache: the verdict reads the git INDEX / untracked state
  // (`git ls-files --cached --others`), which the content tree-hash cache key
  // does not capture — an index-only change (e.g. an override removed from the
  // index but not the working tree) would otherwise reuse a stale PASS. The
  // check is cheap, so always re-running it is the correct trade.
  cacheSignature: () => null,
  async run() {
    const root = await getRoot();

    // The set of override files present in the worktree. `--cached` covers
    // tracked/staged files and `--others --exclude-standard` covers freshly
    // written-but-unstaged ones, so `./singularity build` (which runs before a
    // commit) doesn't fail the instant an agent writes an override. Push's
    // dirty-tree gate guarantees committed-ness at merge time.
    const proc = Bun.spawn(
      ["git", "ls-files", "--others", "--cached", "--exclude-standard", "--", "config/"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const present = new Set(
      (await new Response(proc.stdout).text()).trim().split("\n").filter(Boolean),
    );
    const grandfathered = new Set(grandfatheredSlots);

    const missing: string[] = []; // not authored, not grandfathered → new slot owes an override
    const redundant: string[] = []; // grandfathered but an override now exists → prune the entry
    for (const slot of reorderableSlots) {
      const path = overridePathFor(slot.pluginId, slot.slotId);
      const hasOverride = present.has(path);
      const isGrandfathered = grandfathered.has(path);
      if (hasOverride && isGrandfathered) redundant.push(path);
      else if (!hasOverride && !isGrandfathered) missing.push(path);
    }

    if (missing.length === 0 && redundant.length === 0) return { ok: true };

    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(
        `${missing.length} reorderable slot(s) have no authored config override:\n` +
          missing.map((p) => `    ${p}`).join("\n") +
          "\n\nWhy this is required: a reorderable slot's on-screen order must be a " +
          "deliberate, committed layout — not the non-deterministic natural order " +
          "contributions happen to load in. Each new reorderable slot therefore owes " +
          "a hand-curated override. This step is intentionally manual: a human decides " +
          "the order.",
      );
    }
    if (redundant.length > 0) {
      parts.push(
        `${redundant.length} grandfathered slot(s) now have an override — remove them from plugins/reorder/check/grandfathered-slots.ts:\n` +
          redundant.map((p) => `    ${p}`).join("\n"),
      );
    }

    return {
      ok: false,
      message: parts.join("\n\n"),
      hint: [
        missing.length > 0 &&
          "For each slot: copy its generated <slot>.origin.jsonc to <slot>.jsonc (same dir, drop \".origin\"), keep the leading // @hash line, and arrange the `items` array for how the slot actually renders (sidebar = vertical list, toolbar = horizontal bar, pane = stacked). See plugins/reorder/authoring-overrides.md. If this slot's order should NOT be user-curated, it is headless — declare it with `defineMountSlot` instead of `defineRenderSlot` (mount slots are not reorderable).",
        redundant.length > 0 &&
          "Delete the listed paths from plugins/reorder/check/grandfathered-slots.ts.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  },
};

export default check;
