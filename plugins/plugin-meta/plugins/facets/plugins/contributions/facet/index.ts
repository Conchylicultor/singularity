import { join } from "path";
import type { PluginTree, PluginNode } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  createFacet,
  getFacet,
  type DocFact,
  type ExtractContext,
} from "@plugins/plugin-meta/plugins/facets/core";
import { slotsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";
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
      // stripTypes drops comments on the happy path; masking comments/regex
      // (keeping slot/prop strings) additionally defends the transpile-failure
      // fallback so a commented contribution call is never parsed as real.
      const webSrc = maskSource(stripTypes(webIndex), { strings: false });
      const paneDefs = parsePaneDefinitions(join(ctx.dir, "web"));
      const block = extractContributionsBlock(webSrc);
      if (block !== null) {
        const importMap = parseImports(webSrc);
        for (const call of findCalls(block)) {
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
              id?: string;
              _doc?: { label?: string; detail?: string };
            }>
          | undefined;
        if (!rawContributions) continue;

        for (const c of rawContributions) {
          if (!c._slotId) continue;
          const comp = c.component;
          const componentName =
            typeof comp === "function" && comp.name ? (comp.name as string) : undefined;
          runtimeContributions.push({
            slotId: c._slotId,
            // slotDisplayName + pluginId filled in by relate()
            componentName,
            doc: c._doc ?? {},
            id: typeof c.id === "string" ? c.id : undefined,
          });
        }
      }
    }

    return { static: staticContributions, runtime: runtimeContributions, slotContributors: [] };
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
        if (!c.slotDisplayName) {
          c.slotDisplayName = slotDisplayNames.get(c.slotId);
        }
        c.pluginId = node.id;
      }
    }

    // Compute slotContributors across tree (from slots + static contributions)
    // Only consider statically-defined slots (not _runtimeOnly) to match prior behavior
    const slotGroupToOwner = new Map<string, PluginNode>();
    for (const info of tree.byDir.values()) {
      const nodeSlots = (getFacet(info, slotsFacetDef) ?? [])
        .filter(s => !(s as { _runtimeOnly?: boolean })._runtimeOnly);
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
        // Link each contribution back to the plugin that defines its slot.
        c.definerPluginId = owner.id;
        // Reverse index: record this contributor on the slot owner.
        const ownerData = getFacet(owner, contributionsFacetDef);
        if (ownerData && !ownerData.slotContributors.includes(contributor.name)) {
          ownerData.slotContributors.push(contributor.name);
        }
      }
    }
    for (const info of tree.byDir.values()) {
      const data = getFacet(info, contributionsFacetDef);
      if (data) data.slotContributors.sort();
    }
  },

  renderDoc(data: ContributionsFacetData) {
    const facts: DocFact[] = [];
    if (data.runtime.length > 0) {
      const values = data.runtime.map((c) => {
        const parts = [`\`${c.slotDisplayName ?? c.slotId}\``];
        if (c.doc.label) parts.push(`"${c.doc.label}"`);
        if (c.doc.detail) parts.push(`(${c.doc.detail})`);
        if (c.componentName) parts.push(`→ \`${c.componentName}\``);
        return parts.join(" ");
      });
      facts.push({ folder: "web", key: "Contributes", values });
    }
    if (data.slotContributors.length > 0) {
      facts.push({ folder: "cross-plugin", key: "Slot contributors", values: data.slotContributors.map((n) => `\`${n}\``) });
    }
    return facts;
  },
});
