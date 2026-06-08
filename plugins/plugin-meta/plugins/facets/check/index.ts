import { existsSync } from "fs";
import { join, relative } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { loadFacets } from "@plugins/plugin-meta/plugins/facets/core";
import {
  registerBarrelStubs,
  importBarrel,
} from "@plugins/plugin-meta/plugins/barrel-import/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// The three browser render surfaces every facet must cover. Each entry is a
// stable web-slot id (the registry key) owned by a consumer plugin. A
// contribution names its facet via `facetId` (diff/contributions, explicit
// field) or `id` (detail sections carry the facet id as their section id). Only
// the explicit `facetId` surfaces (diff/contributions) get orphan detection —
// `plugin-view.section` is a generic slot that may host non-facet sections.
const RENDER_SURFACES = [
  {
    surface: "diff",
    slotId: "review.plugin-changes.diff-renderer",
    facetKey: "facetId" as const,
    explicit: true,
  },
  {
    surface: "detail",
    slotId: "plugin-view.section",
    facetKey: "id" as const,
    explicit: false,
  },
  {
    surface: "contributions",
    slotId: "contributions.facet-table",
    facetKey: "facetId" as const,
    explicit: true,
  },
];

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const check: Check = {
  id: "facets:render-complete",
  description:
    "Every facet from loadFacets() has a render contributor in each web render slot (diff, detail, contributions) with a matching facet id",
  async run() {
    const root = await getRoot();
    const pluginsRoot = join(root, "plugins");
    const facetIds = (await loadFacets()).map((f) => f.def.id).sort();
    const facetIdSet = new Set(facetIds);

    const tree = await buildPluginTree(pluginsRoot, { skipBarrelImport: true });
    registerBarrelStubs(join(pluginsRoot, ".."));

    const covered = new Map(
      RENDER_SURFACES.map((s) => [s.slotId, new Set<string>()]),
    );
    const orphans: { surface: string; facetId: string; dir: string }[] = [];

    for (const node of tree.byDir.values()) {
      const webIndex = join(node.dir, "web", "index.ts");
      if (!existsSync(webIndex)) continue;
      let mod: Record<string, unknown>;
      try {
        mod = await importBarrel(webIndex);
      } catch (err) {
        return {
          ok: false,
          message: `Failed to import web barrel ${relative(root, webIndex)}: ${String(err)}`,
        };
      }
      const def = mod.default as
        | { contributions?: Array<Record<string, unknown> & { _slotId?: string }> }
        | undefined;
      const contributions = def?.contributions;
      if (!contributions) continue;
      for (const c of contributions) {
        const surface = RENDER_SURFACES.find((s) => s.slotId === c._slotId);
        if (!surface) continue;
        const fid = c[surface.facetKey];
        if (typeof fid !== "string") continue;
        covered.get(surface.slotId)!.add(fid);
        if (surface.explicit && !facetIdSet.has(fid)) {
          orphans.push({
            surface: surface.surface,
            facetId: fid,
            dir: relative(root, node.dir),
          });
        }
      }
    }

    const missing: string[] = [];
    for (const fid of facetIds) {
      for (const s of RENDER_SURFACES) {
        if (!covered.get(s.slotId)!.has(fid)) {
          missing.push(
            `    facet "${fid}" → missing ${s.surface} renderer (no contribution to ${s.slotId})`,
          );
        }
      }
    }

    if (missing.length === 0 && orphans.length === 0) return { ok: true };

    const parts: string[] = [];
    if (missing.length) {
      parts.push(
        `${missing.length} missing facet render surface(s):\n${missing.join("\n")}`,
      );
    }
    if (orphans.length) {
      parts.push(
        `${orphans.length} render contribution(s) target an unknown facet:\n${orphans
          .map(
            (o) =>
              `    ${o.surface} renderer in ${o.dir} → facetId "${o.facetId}" (no such facet)`,
          )
          .join("\n")}`,
      );
    }
    return {
      ok: false,
      message: parts.join("\n\n"),
      hint: "Add the missing render-{diff,detail,contributions}/web sub-plugin under the facet's folder (see plugins/plugin-meta/plugins/facets/CLAUDE.md), or fix the facetId/section id.",
    };
  },
};

export default check;
