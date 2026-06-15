import { join } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { classifyEdges, resolveComposition } from "@plugins/plugin-meta/plugins/closure/core";
import { loadCompositions } from "@plugins/plugin-meta/plugins/composition/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], { stdout: "pipe", stderr: "pipe" });
  return (await new Response(proc.stdout).text()).trim();
}

const fail = (message: string, hint?: string): CheckResult => ({ ok: false, message, hint });

const check: Check = {
  id: "composition-closure",
  description:
    "Every declared composition is valid: unique name, all entry/contributor ids resolve, and each selected contributor is a genuine, load-bearing soft option (no redundant selections).",
  async run() {
    const root = await getRoot();
    const tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true });
    const graph = classifyEdges(tree);
    const allIds = new Set<PluginId>([...tree.byDir.values()].map((n) => n.id));

    const manifests = await loadCompositions();

    // 1. Unique names across all compositions (loadCompositions does not de-dupe).
    const seenNames = new Set<string>();
    for (const m of manifests) {
      if (seenNames.has(m.name)) {
        return fail(
          `duplicate composition name "${m.name}"`,
          "Each composition/index.ts manifest must declare a unique `name`.",
        );
      }
      seenNames.add(m.name);
    }

    for (const m of manifests) {
      // 2. Entry points: non-empty and every id resolves.
      if (m.entryPoints.length === 0) {
        return fail(`composition "${m.name}" has no entryPoints`);
      }
      for (const id of [...m.entryPoints, ...m.selectedContributors]) {
        if (!allIds.has(id)) {
          return fail(
            `composition "${m.name}" references unknown plugin id "${id}"`,
            "Ids are dot-encoded PluginIds (e.g. `apps.agent-manager`). Build via `asPluginId(...)` and confirm the plugin exists.",
          );
        }
      }

      const comp = resolveComposition(graph, m);

      // 3. No selection already locked in by the entries' hard edges.
      if (comp.redundantSelections.length > 0) {
        return fail(
          `composition "${m.name}" selects already-required contributor(s): ${comp.redundantSelections.join(", ")}`,
          "A contributor pulled in by the entry points' hard closure is included unconditionally — remove it from selectedContributors.",
        );
      }

      // 4. Every selected contributor must be a genuine, load-bearing soft option:
      //    deselecting it must remove it from the bundle (i.e. it is in the
      //    `available` frontier of the composition resolved without it). This rejects
      //    selections that are already pulled in via another contributor's hard
      //    closure, and selections that aren't soft contributors at all.
      for (const id of m.selectedContributors) {
        const without = resolveComposition(graph, {
          ...m,
          selectedContributors: m.selectedContributors.filter((x) => x !== id),
        });
        if (!without.available.includes(id)) {
          return fail(
            `composition "${m.name}" selects "${id}", which is not a genuine soft option`,
            "It is either not a soft contributor to this bundle, or it is already pulled in by another selection's hard closure. Remove it from selectedContributors.",
          );
        }
      }
    }

    return { ok: true };
  },
};

export default check;
