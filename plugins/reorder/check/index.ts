import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { reorderableSlots } from "../shared/reorderable-slots.generated";
import { grandfatheredSlots } from "./grandfathered-slots";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

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
        `${missing.length} reorderable slot(s) missing an authored config override:\n` +
          missing.map((p) => `    ${p}`).join("\n"),
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
          "For each missing slot, author its override per plugins/reorder/authoring-overrides.md (copy .origin.jsonc to .jsonc, curate items, keep the leading // @hash line) — or set `reorder: false` on the slot if its order shouldn't be user-curated.",
        redundant.length > 0 &&
          "Delete the listed paths from plugins/reorder/check/grandfathered-slots.ts.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  },
};

export default check;
