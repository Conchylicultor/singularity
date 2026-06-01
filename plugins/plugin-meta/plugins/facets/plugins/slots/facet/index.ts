import { join } from "path";
import {
  createFacet,
} from "@plugins/plugin-meta/plugins/facets/core";
import {
  readIfExists,
  stripTypes,
  parseDefineGroup,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type SlotDef, slotsFacetDef } from "../core";

function isSlotLike(v: unknown): v is { id: string } {
  return typeof v === "function" && typeof (v as any).id === "string" && typeof (v as any).useContributions === "function";
}

function safeEntries(obj: Record<string, unknown>): [string, unknown][] {
  try {
    return Object.entries(obj);
  } catch (err) {
    if (err instanceof TypeError) return [];
    throw err;
  }
}

function collectRuntimeSlots(importedModules: { mod: Record<string, unknown> }[]): SlotDef[] {
  const seen = new Set<string>();
  const out: SlotDef[] = [];
  for (const { mod } of importedModules) {
    for (const [key, val] of safeEntries(mod)) {
      if (isSlotLike(val) && !seen.has(val.id)) {
        seen.add(val.id);
        out.push({ memberName: key, slotId: val.id, groupName: key });
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        for (const [member, inner] of safeEntries(val as Record<string, unknown>)) {
          if (isSlotLike(inner) && !seen.has(inner.id)) {
            seen.add(inner.id);
            out.push({ memberName: member, slotId: inner.id, groupName: key });
          }
        }
      }
    }
  }
  return out;
}

export default createFacet<SlotDef[]>({
  def: slotsFacetDef,

  extract(ctx) {
    const slots: SlotDef[] = [];

    const src = readIfExists(join(ctx.dir, "web", "slots.ts"));
    if (src) {
      const stripped = stripTypes(src);
      slots.push(...parseDefineGroup(
        stripped,
        "defineSlot",
        (memberName, slotId, groupName) => ({ memberName, slotId, groupName }),
      ));
      slots.push(...parseDefineGroup(
        stripped,
        "defineDispatchSlot",
        (memberName, slotId, groupName) => ({ memberName, slotId, groupName }),
      ));
    }

    if (ctx.importedModules && ctx.importedModules.length > 0) {
      const seen = new Set(slots.map(s => s.slotId));
      for (const rs of collectRuntimeSlots(ctx.importedModules)) {
        if (!seen.has(rs.slotId)) {
          seen.add(rs.slotId);
          (rs as SlotDef & { _runtimeOnly?: boolean })._runtimeOnly = true;
          slots.push(rs);
        }
      }
    }

    return slots;
  },

  renderDoc(data) {
    const staticSlots = data.filter(s => !(s as SlotDef & { _runtimeOnly?: boolean })._runtimeOnly);
    if (staticSlots.length === 0) return [];
    return [
      { folder: "web", key: "Slots", values: staticSlots.map((s) => `\`${s.groupName}.${s.memberName}\``) },
    ];
  },
});
