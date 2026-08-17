import { join } from "path";
import { createFacet } from "@plugins/plugin-meta/plugins/facets/core";
import {
  collectSlots,
  declaredSlotSources,
  isSlot,
} from "@plugins/framework/plugins/slot-declaration/core";
import type { SlotSource } from "@plugins/framework/plugins/slot-declaration/core";
import {
  readIfExists,
  stripTypes,
  maskSource,
  parseDefineGroup,
  markerCallSpans,
  readStaticCallId,
  walkFiles,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type SlotDef, slotsFacetDef } from "../core";

/**
 * Parse `defineRenderSlot(...)` / `defineMountSlot(...)` calls. Mirrors
 * `parseDefineGroup`, but these slots aren't always assigned inside a
 * `Member: builder(...)` group entry (some are standalone, e.g.
 * `VariantGroup: defineRenderSlot<T>("id", {...})`). So we scan each builder
 * occurrence directly: take the first string literal as the id and the nearest
 * preceding `Member:` (or `const Member =`) as the member name. `kind` is fixed
 * by the builder — `"render"` (always reorderable) or `"mount"` (never).
 */
function parseSlotCalls(
  original: string,
  masked: string,
  builder:
    | "defineRenderSlot"
    | "defineMountSlot"
    | "defineWrapperSlot"
    | "defineOrderedDispatchSlot",
  kind: "render" | "mount" | "wrap" | "ordered-dispatch",
): SlotDef[] {
  const out: SlotDef[] = [];
  // Locate calls over the FULL mask so a `defineRenderSlot("x")` written inside a
  // string/template literal is never matched; read the id back from the ORIGINAL
  // at the call's arg span.
  for (const span of markerCallSpans(masked, builder)) {
    // Skip ids built from template/identifier expressions (e.g.
    // `${id}.section` inside defineDetailSections) — not statically resolvable.
    const slotId = readStaticCallId(original, span);
    if (!slotId) continue;

    // The member/group name is the nearest `Word:` or `const Word =` before the
    // call, computed over the MASKED prefix so a `Word:` inside a string can't
    // invent a false member.
    const prefix = masked.slice(0, span.identifier);
    const nameMatch = /(\w+)\s*:\s*$|(?:export\s+)?const\s+(\w+)\s*=\s*$/.exec(
      prefix.replace(/<[^>]*>\s*$/, ""),
    );
    const memberName = (nameMatch && (nameMatch[1] ?? nameMatch[2])) ?? slotId;
    // Group name: nearest enclosing `export const Group = {` if any, else member.
    const groupMatch = [
      ...prefix.matchAll(/export\s+const\s+([A-Z]\w*)\s*=\s*\{/g),
    ].pop();
    const groupName = groupMatch ? groupMatch[1]! : memberName;

    out.push({ memberName, slotId, groupName, kind, contributors: [] });
  }
  return out;
}

/**
 * Static parse of every source file under the plugin's OWN `web/` (walkFiles
 * skips sub-plugin `plugins/` trees, `node_modules` and tests), deduped by slot
 * id, first writer wins.
 *
 * Two callers, two jobs. Under `skipBarrelImport` this IS the slot set. When
 * barrels are imported the declaration is the set, and this supplies only the
 * DISPLAY NAMES (`Group.Member`) — the one thing source text knows and the
 * runtime has erased. A slot the parse can't reach (a factory's templated id)
 * simply has no static name.
 */
function parseSlotsFromSource(dir: string): SlotDef[] {
  const slots: SlotDef[] = [];
  const seen = new Set<string>();
  const files: string[] = [];
  walkFiles(join(dir, "web"), files);

  for (const file of files) {
    const src = readIfExists(file);
    if (!src) continue;
    // stripTypes drops comments on the happy path; a FULL mask additionally
    // defends the transpile-failure fallback — a `defineSlot("x")` written in a
    // comment or string/template literal is blanked away and never parsed as a
    // real slot, while each real id is read back from the original by offset.
    const original = stripTypes(src, file);
    const masked = maskSource(original);
    // Render and mount slots first: scanned by builder name (distinct from
    // `defineSlot`, so the group parser below won't double-count them).
    const fileSlots: SlotDef[] = [
      ...parseSlotCalls(original, masked, "defineRenderSlot", "render"),
      ...parseSlotCalls(original, masked, "defineMountSlot", "mount"),
      ...parseSlotCalls(original, masked, "defineWrapperSlot", "wrap"),
      // Before the `defineDispatchSlot` group pass: an ordered-dispatch slot is
      // usually a standalone `const`, which that pass (group members only) never
      // reaches — and first writer wins the dedupe below.
      ...parseSlotCalls(
        original,
        masked,
        "defineOrderedDispatchSlot",
        "ordered-dispatch",
      ),
      ...parseDefineGroup(
        original,
        "defineSlot",
        (memberName, slotId, groupName): SlotDef => ({
          memberName,
          slotId,
          groupName,
          kind: "slot",
          contributors: [],
        }),
      ),
      ...parseDefineGroup(
        original,
        "defineDispatchSlot",
        (memberName, slotId, groupName): SlotDef => ({
          memberName,
          slotId,
          groupName,
          kind: "dispatch",
          contributors: [],
        }),
      ),
    ];
    for (const slot of fileSlots) {
      if (seen.has(slot.slotId)) continue;
      seen.add(slot.slotId);
      slots.push(slot);
    }
  }
  return slots;
}

function safeEntries(obj: Record<string, unknown>): [string, unknown][] {
  try {
    return Object.entries(obj);
  } catch (err) {
    if (err instanceof TypeError) return [];
    throw err;
  }
}

interface SlotName {
  memberName: string;
  groupName: string;
}

/**
 * Display names for a declared slot, from the barrel's OWN top-level exports —
 * ONE shallow pass, no recursion and no sniffing, because it decides nothing:
 * the set comes from the declaration, this only spells each entry the way its
 * author wrote it (`Shell.Sidebar`, `TaskDetailSections.Section`).
 *
 * A slot exported directly is `Key.Key`; a slot inside an exported group object
 * is `ExportKey.MemberKey`. That covers a factory result assigned to an exported
 * const too, which is the case source text cannot name (its id is templated).
 */
function namesFromBarrelExports(
  mod: Record<string, unknown>,
): Map<string, SlotName> {
  const names = new Map<string, SlotName>();
  for (const [key, val] of safeEntries(mod)) {
    if (isSlot(val)) {
      if (!names.has(val.id))
        names.set(val.id, { memberName: key, groupName: key });
      continue;
    }
    if (!val || (typeof val !== "object" && typeof val !== "function"))
      continue;
    for (const [member, inner] of safeEntries(val as Record<string, unknown>)) {
      if (!isSlot(inner)) continue;
      if (!names.has(inner.id))
        names.set(inner.id, { memberName: member, groupName: key });
    }
  }
  return names;
}

/**
 * The slots a plugin DECLARES (`PluginDefinition.slots`), read off its imported
 * barrels — the authoritative set and the authoritative `kind` (each slot
 * carries its own `meta`, stamped by its constructor).
 *
 * `collectSlots` is the SAME normalisation `PluginProvider` runs, so the facet
 * and the runtime can never disagree about what a plugin declared. Names are
 * joined in from the barrel's exports, else the static parse; a declared slot
 * neither can spell (a pane's `pane.<id>.actions`) is named by its id, which is
 * honest — there is no `Group.Member` spelling to report.
 */
function collectDeclaredSlots(
  dir: string,
  importedModules: { mod: Record<string, unknown> }[],
): SlotDef[] {
  const declaring: { sources: SlotSource[]; names: Map<string, SlotName> }[] =
    [];
  for (const { mod } of importedModules) {
    const sources = declaredSlotSources(mod);
    if (!sources) continue;
    declaring.push({ sources, names: namesFromBarrelExports(mod) });
  }
  if (declaring.length === 0) return [];

  // Only parsed when a declared slot has no export-key name — the common case
  // costs no source parse at all.
  let parsedNames: Map<string, SlotName> | null = null;
  const parsedName = (slotId: string): SlotName | undefined => {
    if (!parsedNames) {
      const map = new Map<string, SlotName>();
      for (const def of parseSlotsFromSource(dir)) {
        if (!map.has(def.slotId)) map.set(def.slotId, def);
      }
      parsedNames = map;
    }
    return parsedNames.get(slotId);
  };

  const out: SlotDef[] = [];
  const seen = new Set<string>();
  for (const { sources, names } of declaring) {
    for (const slot of collectSlots(dir, sources)) {
      if (seen.has(slot.id)) continue;
      seen.add(slot.id);
      const named = names.get(slot.id) ??
        parsedName(slot.id) ?? { memberName: slot.id, groupName: slot.id };
      out.push({
        memberName: named.memberName,
        groupName: named.groupName,
        slotId: slot.id,
        kind: slot.meta.kind,
        contributors: [],
      });
    }
  }
  return out;
}

export default createFacet<SlotDef[]>({
  def: slotsFacetDef,

  extract(ctx) {
    // Two discovery modes:
    //  - Imports present (the normal build): the plugin's own `slots: [...]`
    //    DECLARATION is the sole authoritative set, and each slot's `meta.kind`
    //    is read off the slot object. Nothing is sniffed and nothing is guessed:
    //    a slot is here because its owner said so, which is also what makes the
    //    attribution correct (it was "whichever barrel exposed it first" while
    //    this walked export graphs). The static parse still runs, but only to
    //    recover the `Group.Member` display names source text alone knows.
    //  - No imports (`skipBarrelImport` build mode): fall back to the static
    //    text parse alone. Its one blind spot is a *dynamic* slot id — an id
    //    built from a template/identifier expression rather than a string
    //    literal (e.g. a factory's `` `${id}.section` ``) — skipped in
    //    `parseSlotCalls`.
    if (ctx.importedModules && ctx.importedModules.length > 0) {
      return collectDeclaredSlots(ctx.dir, ctx.importedModules);
    }
    return parseSlotsFromSource(ctx.dir);
  },

  // The per-slot reverse index (`SlotDef.contributors`) is populated by the
  // `contributions` facet's `relate()`: it already joins slots ↔ contributions
  // (to fill `definerPluginId`) and imports `slotsFacetDef`. The reverse edge —
  // `slots/facet` importing `contributions/core` — would close a collected-dir
  // dependency cycle (`contributions` already `dependsOn` `slots`), so the join
  // lives on the single facet that legally has both in scope.

  renderDoc(data) {
    if (data.length === 0) return [];
    return [
      {
        folder: "web",
        key: "Slots",
        values: data.map((s) => {
          // A slot with no `Group.Member` spelling (its id is templated, so
          // neither the barrel exports nor source text name it) carries the id
          // in both fields — print it once rather than `id.id`.
          const label =
            s.groupName === s.memberName
              ? s.groupName
              : `${s.groupName}.${s.memberName}`;
          const head = `\`${label}\``;
          if (s.contributors.length === 0) return head;
          return `${head} ← ${s.contributors.map((id) => `\`${id}\``).join(", ")}`;
        }),
      },
    ];
  },
});
