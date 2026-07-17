import { join } from "path";
import type { PluginTree, PluginNode } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  createFacet,
  getFacet,
  type DocFact,
  type ExtractContext,
} from "@plugins/plugin-meta/plugins/facets/core";
import { type SlotDef, slotsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";
import { readIfExists, stripTypes, maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";
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
          const displayHead = imp && imp.original !== "default" ? imp.original : head!;
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
          | Array<Record<string, unknown> & {
              _slotId?: string;
              _kind?: symbol;
              id?: string;
              _doc?: { label?: string; detail?: string };
            }>
          | undefined;
        if (!rawContributions) continue;

        for (const c of rawContributions) {
          if (typeof c._slotId === "string") {
            // web slot contribution (existing behavior)
            const comp = c.component;
            const componentName =
              typeof comp === "function" && comp.name ? (comp.name as string) : undefined;
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
          slotDisplayNames.set(s.slotId, s.groupName === s.memberName ? s.groupName : `${s.groupName}.${s.memberName}`);
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
        for (const slot of slotByGroupMember.get(`${head}.${last}`) ?? []) record(slot, node.id);
      }
    }
    for (const [slot, set] of contributorsBySlot) {
      slot.contributors = [...set].sort();
    }
  },

  renderDoc(data: ContributionsFacetData) {
    const facts: DocFact[] = [];
    const fmt = (c: DocMetaContribution): string => {
      const parts = [`\`${c.slotDisplayName ?? c.slotId}\``];
      if (c.doc.label) parts.push(`"${c.doc.label}"`);
      if (c.doc.detail) parts.push(`(${c.doc.detail})`);
      if (c.componentName) parts.push(`→ \`${c.componentName}\``);
      return parts.join(" ");
    };
    const web = data.runtime.filter((c) => c.kind === "slot");
    const server = data.runtime.filter((c) => c.kind === "server");
    if (web.length > 0) facts.push({ folder: "web", key: "Contributes", values: web.map(fmt) });
    if (server.length > 0) facts.push({ folder: "server", key: "Contributes", values: server.map(fmt) });
    return facts;
  },
});
