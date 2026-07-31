import { existsSync } from "fs";
import { join } from "path";
import { buildEnrichedTree } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getFacet } from "@plugins/plugin-meta/plugins/facets/core";
import { contributionsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import { importBarrel, registerBarrelStubs } from "@plugins/plugin-meta/plugins/barrel-import/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type { Check, CheckResult } from "@plugins/framework/plugins/tooling/core";

// Canonical slot tokens (see plugins/page/plugins/editor/{web/slots.ts,
// server/internal/block-registry.ts}). Both sides carry the block TYPE as their
// contribution's doc label — web `docLabel: (c) => c.block?.type`, server
// `docLabel: (h) => h.type` — which is the join key this check is built on.
const WEB_BLOCK_SLOT = "page.editor.block"; // Editor.Block  (web dispatch _slotId)
const SERVER_BLOCK_DATA_SLOT = "page.block-data"; // Editor.BlockData (server _kind)
const WEB_BLOCK_FRAME_SLOT = "page.editor.block-frame"; // Editor.BlockFrame (web dispatch _slotId)

// The `editor` plugin ITSELF registers `Editor.BlockData("page")` (page rows are
// written by editor server code directly, so page creation must not depend on the
// sub-page renderer). We therefore ALWAYS expect "page" in the server set — its
// absence means barrel import saw no BlockData contributions at all, i.e. the
// server scan silently degraded. Used as a health canary, not a hardcoded rule.
const CANARY_SERVER_TYPE = "page";

// Server `Editor.BlockData` contributions are now read off the SAME contributions
// facet as the web `Editor.Block` half (see the loop below). The facet's runtime
// extractor captures server registrations — `defineServerContribution` marks each
// with a `_kind` SYMBOL whose description is the registry token — as
// `{ kind: "server", slotId: <token>, doc.label: <type> }`, exactly mirroring how
// web slot contributions surface as `{ kind: "slot", … }`. The former reflective
// barrel-import workaround is gone: both sides of the invariant come from one tree.
const check: Check = {
  id: "page.editor:block-data-registered",
  description:
    "every block TYPE rendered on the web (`Editor.Block`) also has a server-side `data` schema (`Editor.BlockData`), so the write boundary can validate its data",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();

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
    const serverTypes = new Set<string>();
    for (const node of tree.byDir.values()) {
      const facet = getFacet(node, contributionsFacetDef);
      if (!facet) continue;
      for (const c of facet.runtime) {
        if (c.kind === "slot" && c.slotId === WEB_BLOCK_SLOT) {
          const type = c.doc.label;
          if (!type) continue;
          const list = webTypeToPlugins.get(type) ?? [];
          list.push(node.id);
          webTypeToPlugins.set(type, list);
        } else if (c.kind === "server" && c.slotId === SERVER_BLOCK_DATA_SLOT) {
          const type = c.doc.label;
          if (type) serverTypes.add(type);
        }
      }
    }

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

/**
 * A container ANCHOR's two halves must agree.
 *
 * `BlockHandle.anchor: true` lives in `core` because the pure REDUCER needs it
 * (the empty-anchor prune, the split/merge refusals) and the server has no
 * slots. The DECORATION it implies — the glyph the surface paints in the indent
 * gutter — is a React component, so it rides on the web `Editor.BlockFrame`
 * contribution (see `web/slots.ts` for why it rides there and not on a slot of
 * its own). Two declarations, each where it is needed, and nothing in the type
 * system ties them together.
 *
 * A handle claiming anchorhood with no decoration is not cosmetic: the reducer
 * treats the type as a void container (its row renders no line, and while it has
 * visible children the surface collapses that row to ZERO height), while the
 * surface paints nothing into the column — an invisible container. This check is
 * what stops the two from silently disagreeing.
 *
 * Both facts are read by IMPORTING the same web barrels the docgen tree already
 * imports (a static source scan cannot recover `anchor` off
 * `Editor.Block({ match: fooBlock.type, block: fooBlock })`, and ad-hoc marker
 * scanning is banned outright). The barrel module is Bun-cached, so re-importing
 * after `buildEnrichedTree` costs nothing.
 */
const anchorHasDecoration: Check = {
  id: "page-editor:anchor-has-decoration",
  description:
    "every block handle declaring `anchor: true` has a matching `anchor` component on its plugin's `Editor.BlockFrame` contribution",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();
    const tree = await buildEnrichedTree(root);
    registerBarrelStubs(root);

    // Only plugins that actually contribute a block renderer can declare a
    // handle, so the candidate set comes from the contributions facet rather
    // than a directory sweep — a block type living outside `plugins/page` is
    // covered for free.
    const candidateDirs = new Set<string>();
    for (const [dir, node] of tree.byDir) {
      const facet = getFacet(node, contributionsFacetDef);
      if (!facet) continue;
      for (const c of facet.runtime) {
        if (
          c.kind === "slot" &&
          (c.slotId === WEB_BLOCK_SLOT || c.slotId === WEB_BLOCK_FRAME_SLOT)
        ) {
          // A web slot contribution can only have come from a web barrel; the
          // guard is belt-and-braces so a tree oddity cannot turn into a throw.
          if (existsSync(join(dir, "web", "index.ts"))) candidateDirs.add(dir);
          break;
        }
      }
    }

    if (candidateDirs.size === 0) {
      return {
        ok: false,
        message:
          "No web `Editor.Block` / `Editor.BlockFrame` contributions found in the enriched plugin " +
          "tree — the barrel-imported contributions facet is empty, so the anchor↔decoration " +
          "invariant could not be verified. This is a check/tooling failure, not a clean pass.",
      };
    }

    // type -> the plugin ids declaring `anchor: true` on its handle.
    const anchorTypes = new Map<string, string[]>();
    // types whose `Editor.BlockFrame` contribution supplies an `anchor` component.
    const decorated = new Set<string>();

    for (const dir of candidateDirs) {
      const mod = await importBarrel(join(dir, "web", "index.ts"));
      const def = mod.default as { contributions?: unknown } | undefined;
      const contributions = def?.contributions;
      if (!Array.isArray(contributions)) continue;
      for (const raw of contributions) {
        const c = raw as {
          _slotId?: string;
          match?: unknown;
          anchor?: unknown;
          block?: { type?: unknown; anchor?: unknown };
        };
        if (c._slotId === WEB_BLOCK_SLOT) {
          const type = c.block?.type;
          if (typeof type === "string" && c.block?.anchor === true) {
            const list = anchorTypes.get(type) ?? [];
            list.push(tree.byDir.get(dir)?.id ?? dir);
            anchorTypes.set(type, list);
          }
        } else if (c._slotId === WEB_BLOCK_FRAME_SLOT) {
          if (typeof c.match === "string" && c.anchor) decorated.add(c.match);
        }
      }
    }

    const missing = [...anchorTypes.entries()]
      .filter(([type]) => !decorated.has(type))
      .sort(([a], [b]) => a.localeCompare(b));

    if (missing.length === 0) return { ok: true };

    const lines = missing.map(
      ([type, plugins]) =>
        `  block type "${type}" (declared by: ${[...new Set(plugins)].sort().join(", ")}) ` +
        "declares `anchor: true` but contributes no `anchor` component on `Editor.BlockFrame`",
    );
    return {
      ok: false,
      message:
        `${missing.length} anchor block type(s) render no decoration, so their container is ` +
        `invisible (the row collapses to zero height and nothing paints the gutter column):\n${lines.join("\n")}`,
      hint:
        "Add the decoration to the SAME `Editor.BlockFrame` contribution that makes the type a " +
        "container:\n" +
        "  Editor.BlockFrame({ match: <handle>.type, component: <Frame>, anchor: <Anchor> })\n" +
        "The anchor component takes `BlockAnchorProps` ({ type, data, editor? }) and renders " +
        "APPEARANCE only — the surface owns its position, and the structural actions live on " +
        "the rail of the line the container borrows. Alternatively drop " +
        "`anchor: true` from the handle if the type really does render its own line.",
    };
  },
};

export default [check, anchorHasDecoration];
