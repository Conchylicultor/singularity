import { join } from "path";
import type {
  PluginTree,
  PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  createFacet,
  getFacet,
  type DocFact,
  type ExtractContext,
} from "@plugins/plugin-meta/plugins/facets/core";
import {
  type SlotDef,
  slotsFacetDef,
} from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";
import { slotDeclarationPasses } from "@plugins/framework/plugins/slot-declaration/core";
import {
  readIfExists,
  stripTypes,
  maskSource,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import {
  type Contribution,
  type ContributionsFacetData,
  type DocMetaContribution,
  contributionsFacetDef,
} from "../core";
import {
  parseImports,
  extractContributionsBlock,
  findCalls,
  parsePropsBlock,
  parsePaneDefinitions,
} from "./internal/static-parse";

export default createFacet<ContributionsFacetData>({
  def: contributionsFacetDef,

  extract(ctx: ExtractContext): ContributionsFacetData {
    // Static contributions from web barrel source
    const staticContributions: Contribution[] = [];
    const webIndex = readIfExists(join(ctx.dir, "web", "index.ts"));
    if (webIndex) {
      // Mask the source FULLY (comments/regex AND string interiors blanked) and
      // locate the block + each call over the mask, then read the real slot
      // name / prop values back from the ORIGINAL by offset. A contribution call
      // written inside a string or template literal (a fixture, a docs snippet)
      // then vanishes from the mask, while a real call's blanked string args are
      // recovered from the original — closing the string-embedding false-positive
      // class. `maskSource` preserves offsets 1:1, so masked and stripped align.
      const stripped = stripTypes(webIndex);
      const masked = maskSource(stripped);
      const paneDefs = parsePaneDefinitions(join(ctx.dir, "web"));
      const block = extractContributionsBlock(masked);
      if (block !== null) {
        // parseImports masks internally via findImports, so it takes the raw
        // (type-stripped) source directly, not the masked copy.
        const importMap = parseImports(stripped);
        const maskedBlock = masked.slice(block.start, block.end);
        const origBlock = stripped.slice(block.start, block.end);
        for (const call of findCalls(maskedBlock, origBlock)) {
          const [head, ...rest] = call.callee.split(".");
          const tail = rest.join(".");
          const imp = importMap.get(head!);
          const displayHead =
            imp && imp.original !== "default" ? imp.original : head!;
          const slot = `${displayHead}.${tail}`;
          const props = parsePropsBlock(call.argsBody);
          const contribution: Contribution = { slot, props };
          if (slot === "Pane.Register" && props["pane"]) {
            const def = paneDefs.get(props["pane"].trim());
            if (def) {
              contribution.paneId = def.id;
              contribution.panePath = def.path;
            }
          }
          staticContributions.push(contribution);
        }
      }
    }

    // Runtime contributions from barrel imports (existing logic)
    const runtimeContributions: DocMetaContribution[] = [];
    const { importedModules } = ctx;
    if (importedModules && importedModules.length > 0) {
      // A plugin's `contributions` array is not always a literal in its barrel.
      // `reorder`'s starts empty and is filled by a `subscribeSlotsDeclared`
      // callback — one config directive per reorderable slot — so it holds 0
      // entries until a slot-declaration pass has run in THIS process, and ~240
      // after. Reading the array before that pass therefore answers with a
      // smaller set that is indistinguishable from a correct one: that is how a
      // `docs/plugins-details.md` missing reorder's whole `Contributes:` block
      // got committed, and how it made `main` un-pushable four commits later.
      // Refuse the early read instead of quietly under-reporting.
      //
      // The `skipBarrelImport` path passes no modules, so it never reaches here,
      // and facets never run in the browser.
      if (slotDeclarationPasses() === 0) {
        throw new Error(
          "[facet.contributions] Plugin barrels are imported, but no slot-declaration pass " +
            "has run in this process. Any plugin whose `contributions` are derived from the " +
            "declaration — reorder mints one config directive per reorderable slot — would " +
            "read as EMPTY, and the result would look like a correct, slightly smaller answer. " +
            "Build the tree with `buildEnrichedTree()` from " +
            "`@plugins/framework/plugins/tooling/plugins/codegen/core`, which runs the pass " +
            "first, instead of calling `buildPluginTree(..., { facets: true })` directly.",
        );
      }
      for (const { mod } of importedModules) {
        let def: Record<string, unknown> | undefined;
        try {
          def = mod.default as Record<string, unknown> | undefined;
        } catch (err) {
          if (!(err instanceof TypeError)) throw err;
          continue;
        }
        if (!def) continue;

        // `_pluginId` is stamped onto each contribution only at runtime by
        // PluginProvider (`_pluginId = p.id`); the raw barrel export imported
        // here carries neither it nor a `def.id` (the loader injects the plugin
        // id, plugins never author it). The authoritative owner is the node
        // whose barrel we're importing, so `pluginId` is filled in `relate()`
        // from `node.id` — matching the runtime `entryKey` (`${p.id}:${id}`).
        const rawContributions = def.contributions as
          | Array<
              Record<string, unknown> & {
                _slotId?: string;
                _kind?: symbol;
                id?: string;
                _doc?: { label?: string; detail?: string };
              }
            >
          | undefined;
        if (!rawContributions) continue;

        for (const c of rawContributions) {
          if (typeof c._slotId === "string") {
            // web slot contribution (existing behavior)
            const comp = c.component;
            const componentName =
              typeof comp === "function" && comp.name
                ? (comp.name as string)
                : undefined;
            runtimeContributions.push({
              kind: "slot",
              slotId: c._slotId,
              // slotDisplayName + pluginId filled in by relate()
              componentName,
              doc: c._doc ?? {},
              id: typeof c.id === "string" ? c.id : undefined,
            });
          } else if (typeof c._kind === "symbol" && c._kind.description) {
            // server registration (defineServerContribution): the `_kind` symbol's
            // description is the registry token (e.g. "page.block-data").
            runtimeContributions.push({
              kind: "server",
              slotId: c._kind.description,
              // pluginId filled in by relate(); no component, no SlotDef display name.
              doc: c._doc ?? {},
              id: typeof c.id === "string" ? c.id : undefined,
            });
          }
          // else: no recognizable marker → skip (unchanged for malformed entries)
        }
      }
    }

    return { static: staticContributions, runtime: runtimeContributions };
  },

  relate(rawCtx) {
    const { tree } = rawCtx as { tree: PluginTree };

    // Build slotId -> displayName from the slots facet
    const slotDisplayNames = new Map<string, string>();
    for (const node of tree.byDir.values()) {
      const nodeSlots = getFacet(node, slotsFacetDef) ?? [];
      for (const s of nodeSlots) {
        if (!slotDisplayNames.has(s.slotId)) {
          slotDisplayNames.set(
            s.slotId,
            s.groupName === s.memberName
              ? s.groupName
              : `${s.groupName}.${s.memberName}`,
          );
        }
      }
    }

    // Fill display names + the authoritative owner pluginId (the node whose
    // barrel produced these runtime contributions) into already-extracted data.
    for (const node of tree.byDir.values()) {
      const data = getFacet(node, contributionsFacetDef);
      if (!data || data.runtime.length === 0) continue;
      for (const c of data.runtime) {
        // Display names come from the slots facet — web slot contributions only.
        // A server `slotId` (a registry token like "page.block-data") must never
        // collide with a web `SlotDef.slotId`, so it stays undefined and renderDoc
        // falls back to the raw token.
        if (c.kind === "slot" && !c.slotDisplayName) {
          c.slotDisplayName = slotDisplayNames.get(c.slotId);
        }
        c.pluginId = node.id;
      }
    }

    // Link each static contribution back to the plugin that defines its slot
    // (used by the detail PluginLink). The slots facet's runtime walk now
    // discovers every slot (including factory-produced ones at any nesting
    // depth), so all slot groups resolve their contribution owners here.
    const slotGroupToOwner = new Map<string, PluginNode>();
    for (const info of tree.byDir.values()) {
      const nodeSlots = getFacet(info, slotsFacetDef) ?? [];
      for (const slot of nodeSlots) {
        if (!slotGroupToOwner.has(slot.groupName)) {
          slotGroupToOwner.set(slot.groupName, info);
        }
      }
    }
    for (const contributor of tree.byDir.values()) {
      const data = getFacet(contributor, contributionsFacetDef);
      if (!data) continue;
      for (const c of data.static) {
        const head = c.slot.split(".")[0];
        if (!head) continue;
        const owner = slotGroupToOwner.get(head);
        if (!owner || owner === contributor) continue;
        c.definerPluginId = owner.id;
      }
    }

    // Per-slot reverse index: fill each `SlotDef.contributors` (full plugin ids)
    // with every node that contributes to that specific slot. This lives here —
    // not on the slots facet — because the join needs both facets in scope and
    // `slots/facet` importing `contributions/core` would close a collected-dir
    // dependency cycle (`contributions` already `dependsOn` `slots`). Read only
    // the contributions *extract* output (`data.static` / `data.runtime`); the
    // contributor is always the iterating node's `id`.
    //  - Runtime contributions: exact `slotId` match (authoritative, precise).
    //  - Static contributions: group head + last segment, robust for flat
    //    (`PluginView.Section`), nested (`Sonata.Toolbar.Start` → `Sonata.Start`),
    //    and single-member (`group === member`) symbols.
    const slotById = new Map<string, SlotDef[]>();
    const slotByGroupMember = new Map<string, SlotDef[]>();
    for (const node of tree.byDir.values()) {
      const nodeSlots = getFacet(node, slotsFacetDef) ?? [];
      for (const slot of nodeSlots) {
        slot.contributors = [];
        let byId = slotById.get(slot.slotId);
        if (!byId) slotById.set(slot.slotId, (byId = []));
        byId.push(slot);
        const key = `${slot.groupName}.${slot.memberName}`;
        let byGm = slotByGroupMember.get(key);
        if (!byGm) slotByGroupMember.set(key, (byGm = []));
        byGm.push(slot);
      }
    }

    const contributorsBySlot = new Map<SlotDef, Set<string>>();
    const record = (slot: SlotDef, id: string): void => {
      let set = contributorsBySlot.get(slot);
      if (!set) contributorsBySlot.set(slot, (set = new Set()));
      set.add(id);
    };
    for (const node of tree.byDir.values()) {
      const data = getFacet(node, contributionsFacetDef);
      if (!data) continue;
      for (const c of data.runtime) {
        if (c.kind !== "slot") continue;
        for (const slot of slotById.get(c.slotId) ?? []) record(slot, node.id);
      }
      for (const c of data.static) {
        const parts = c.slot.split(".");
        const head = parts[0];
        const last = parts[parts.length - 1];
        if (!head || !last) continue;
        for (const slot of slotByGroupMember.get(`${head}.${last}`) ?? [])
          record(slot, node.id);
      }
    }
    for (const [slot, set] of contributorsBySlot) {
      slot.contributors = [...set].sort();
    }
  },

  renderDoc(data: ContributionsFacetData) {
    const facts: DocFact[] = [];
    const web = data.runtime.filter((c) => c.kind === "slot");
    const server = data.runtime.filter((c) => c.kind === "server");
    if (web.length > 0)
      facts.push({
        folder: "web",
        key: "Contributes",
        values: renderValues(web),
      });
    if (server.length > 0)
      facts.push({
        folder: "server",
        key: "Contributes",
        values: renderValues(server),
      });
    return facts;
  },
});

/**
 * How many same-slot entries it takes before the run is folded onto one line.
 * Purely a readability threshold, NOT a correctness one: below it the output is
 * per-line, above it the output is folded, and both spell exactly the same set.
 * 12 is where a run stops reading as a list and starts reading as noise —
 * reorder mints 212 config directives into one slot, sonata ~100 instruments.
 */
const FOLD_THRESHOLD = 12;

/** One contribution, one line — the long-standing format. */
const fmt = (c: DocMetaContribution): string => {
  const parts = [`\`${c.slotDisplayName ?? c.slotId}\``];
  if (c.doc.label) parts.push(`"${c.doc.label}"`);
  if (c.doc.detail) parts.push(`(${c.doc.detail})`);
  if (c.componentName) parts.push(`→ \`${c.componentName}\``);
  return parts.join(" ");
};

/** The slot key a contribution renders under — what groups a run together. */
const slotKeyOf = (c: DocMetaContribution): string =>
  c.slotDisplayName ?? c.slotId;

/**
 * Render one runtime's contributions, folding a long run of same-slot entries
 * onto a single line.
 *
 * The fold is gated on the group being **label-only** — every member has a
 * `doc.label` and neither a `doc.detail` nor a `componentName` — because the
 * folded line has room for exactly one field per member. A group carrying
 * details or component names would have to drop them to fold, and a doc line
 * that quietly loses the component name is worse than 200 repetitive ones. So
 * the fold is only ever taken where it is lossless: same ids, one line instead
 * of N, listed in sorted order. Every id is listed in full, never truncated, so
 * `grep <config-id> docs/plugins-details.md` still finds it.
 */
function renderValues(contributions: DocMetaContribution[]): string[] {
  // Group by slot key, keeping each group anchored at its FIRST member's
  // position and members in their original relative order: the per-line output
  // must reflect what the plugin actually declares, not a re-ordering the
  // renderer invented. (The folded line is the one exception — see below.)
  const groups = new Map<string, DocMetaContribution[]>();
  for (const c of contributions) {
    const key = slotKeyOf(c);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    group.push(c);
  }

  const values: string[] = [];
  for (const [key, group] of groups) {
    const foldable =
      group.length > FOLD_THRESHOLD &&
      group.every(
        (c) =>
          typeof c.doc.label === "string" &&
          c.doc.label.length > 0 &&
          !c.doc.detail &&
          !c.componentName,
      );
    if (foldable) {
      // The folded line collapses N entries whose only distinguishing content
      // is the label, so it denotes a SET — and a set has to be spelled in a
      // canonical order. The array order it would otherwise inherit is a
      // runtime DECLARATION order (reorder mints one config directive per
      // reorderable slot from a `subscribeSlotsDeclared` callback, in whatever
      // order barrels happened to be imported in that process), which is not
      // stable across processes. Unsorted, the generated doc stops being a pure
      // function of the checkout: `plugins-doc-in-sync` passes when run alone
      // and FAILS inside a full check/build run, on bytes that record process
      // history rather than any edit. `map` already yields a fresh array, so
      // the sort never touches the grouped one the per-line path renders.
      const labels = group
        .map((c) => `"${c.doc.label}"`)
        .sort()
        .join(", ");
      values.push(`\`${key}\` ×${group.length}: ${labels}`);
    } else {
      // Includes every group of 1 — 1 <= FOLD_THRESHOLD — so an ordinary
      // plugin's output is byte-identical to what it has always been.
      for (const c of group) values.push(fmt(c));
    }
  }
  return values;
}
