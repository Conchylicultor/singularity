import { existsSync } from "fs";
import { join } from "path";
import { buildEnrichedTree } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getFacet } from "@plugins/plugin-meta/plugins/facets/core";
import { contributionsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import { registerBarrelStubs, importBarrel } from "@plugins/plugin-meta/plugins/barrel-import/core";
import type { Check, CheckResult } from "@plugins/framework/plugins/tooling/core";

// Canonical slot tokens (see plugins/page/plugins/editor/{web/slots.ts,
// server/internal/block-registry.ts}). Both sides carry the block TYPE as their
// contribution's doc label — web `docLabel: (c) => c.block?.type`, server
// `docLabel: (h) => h.type` — which is the join key this check is built on.
const WEB_BLOCK_SLOT = "page.editor.block"; // Editor.Block  (web dispatch _slotId)
const SERVER_BLOCK_DATA_SLOT = "page.block-data"; // Editor.BlockData (server _kind)

// The `editor` plugin ITSELF registers `Editor.BlockData("page")` (page rows are
// written by editor server code directly, so page creation must not depend on the
// sub-page renderer). We therefore ALWAYS expect "page" in the server set — its
// absence means barrel import saw no BlockData contributions at all, i.e. the
// server scan silently degraded. Used as a health canary, not a hardcoded rule.
const CANARY_SERVER_TYPE = "page";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

/**
 * Block types that have a server-side `data` schema, read by reflecting over the
 * imported server barrels.
 *
 * WHY NOT the contributions facet (like the web side below): the facet's runtime
 * extractor only captures a contribution when it carries a web-SDK `_slotId`
 * string (`if (!c._slotId) continue;`). `Editor.BlockData` is a
 * `defineServerContribution`, which marks its contributions with a `_kind`
 * SYMBOL (in `def.contributions`) and no `_slotId` — so server contributions are
 * invisible to every facet and don't even render in docs. The barrel-import
 * reflection here is the SAME machinery the facet pipeline uses to read runtime
 * contributions (and the same technique `config_v2/check` uses to read config
 * descriptors) — NOT an ad-hoc source scan. Keyed by the contribution's `_kind`
 * symbol description, which equals the slot token the registry was defined with.
 */
async function collectServerBlockDataTypes(
  root: string,
  serverDirs: string[],
): Promise<Set<string>> {
  registerBarrelStubs(join(root, ".."));
  registerBarrelStubs(root);
  const types = new Set<string>();
  for (const dir of serverDirs) {
    const barrel = join(dir, "server", "index.ts");
    if (!existsSync(barrel)) continue;
    const mod = (await importBarrel(barrel)) as { default?: unknown };
    const def = mod.default as { contributions?: unknown } | undefined;
    const contributions = Array.isArray(def?.contributions) ? def!.contributions : [];
    for (const c of contributions as Array<{ _kind?: unknown; _doc?: { label?: string }; type?: string }>) {
      if (typeof c._kind !== "symbol") continue;
      if (c._kind.description !== SERVER_BLOCK_DATA_SLOT) continue;
      const type = c._doc?.label ?? c.type;
      if (type) types.add(type);
    }
  }
  return types;
}

const check: Check = {
  id: "page.editor:block-data-registered",
  description:
    "every block TYPE rendered on the web (`Editor.Block`) also has a server-side `data` schema (`Editor.BlockData`), so the write boundary can validate its data",
  async run(): Promise<CheckResult> {
    const root = await getRoot();

    // The barrel-imported ("enriched") tree — the same tree docgen renders the
    // `Contributes: Editor.Block "<type>" → …` lines from. Its contributions
    // facet carries each web contribution's resolved doc label (the block type),
    // which a static source scan (banned by `no-adhoc-marker-scan`) could not
    // recover from `Editor.Block({ match: fooBlock.type, … })`. Memoized per-root.
    const tree = await buildEnrichedTree(root);

    // The invariant is keyed on the block TYPE, not the plugin: a type's web
    // renderer and its server schema may live in DIFFERENT plugins. `page` is
    // the one real case today — `sub-page` contributes the web `Editor.Block`
    // renderer for type "page", while the `editor` plugin itself owns the server
    // `Editor.BlockData("page")` registration. Keying on the type means this
    // asymmetry needs no per-plugin exception/allowlist: "page" ∈ serverTypes
    // automatically covers sub-page's web contribution.
    const webTypeToPlugins = new Map<string, string[]>();
    const serverDirs: string[] = [];
    for (const node of tree.byDir.values()) {
      if (node.runtimes.server) serverDirs.push(node.dir);
      const facet = getFacet(node, contributionsFacetDef);
      if (!facet) continue;
      for (const c of facet.runtime) {
        if (c.slotId !== WEB_BLOCK_SLOT) continue;
        const type = c.doc.label;
        if (!type) continue;
        const list = webTypeToPlugins.get(type) ?? [];
        list.push(node.id);
        webTypeToPlugins.set(type, list);
      }
    }

    const serverTypes = await collectServerBlockDataTypes(root, serverDirs);

    // Fail LOUD if either side's data is missing rather than pass vacuously.
    // Empty web set ⇒ the contributions facet silently degraded; missing canary
    // ⇒ the server barrel scan silently degraded. Either way the invariant was
    // NOT verified — a tooling failure, not a clean pass, which must never let an
    // unregistered block type slip through to a user's first insert 400ing.
    if (webTypeToPlugins.size === 0) {
      return {
        ok: false,
        message:
          "No web `Editor.Block` contributions found in the enriched plugin tree — " +
          "the barrel-imported contributions facet is empty, so the web↔server block-type " +
          "invariant could not be verified. This is a check/tooling failure, not a clean pass.",
      };
    }
    if (!serverTypes.has(CANARY_SERVER_TYPE)) {
      return {
        ok: false,
        message:
          `The editor's own \`Editor.BlockData("${CANARY_SERVER_TYPE}")\` registration was not ` +
          "observed while scanning server barrels — the server-side contribution scan silently " +
          "degraded, so the web↔server block-type invariant could not be verified. This is a " +
          "check/tooling failure, not a clean pass.",
      };
    }

    const missing = [...webTypeToPlugins.entries()]
      .filter(([type]) => !serverTypes.has(type))
      .sort(([a], [b]) => a.localeCompare(b));

    if (missing.length === 0) return { ok: true };

    const lines = missing.map(
      ([type, plugins]) =>
        `  block type "${type}" (web renderer contributed by: ${[...new Set(plugins)].sort().join(", ")}) ` +
        `has no server \`Editor.BlockData\` registration`,
    );
    return {
      ok: false,
      message:
        `${missing.length} block type(s) rendered on the web have no server \`data\` schema, so the ` +
        `write boundary (POST /api/blocks …) cannot validate their data:\n${lines.join("\n")}`,
      hint:
        "Add a one-line server barrel that contributes the block's handle:\n" +
        "  // plugins/page/plugins/<type>/server/index.ts\n" +
        '  import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";\n' +
        '  import { Editor } from "@plugins/page/plugins/editor/server";\n' +
        '  import { <handle> } from "../core";\n' +
        '  export default { description: "…", contributions: [Editor.BlockData(<handle>)] } satisfies ServerPluginDefinition;\n' +
        "then run `./singularity build`. See plugins/page/plugins/text/server/index.ts for the precedent. " +
        '(The "page" type is registered by the editor plugin itself, not by its web renderer sub-page.)',
    };
  },
};

export default check;
