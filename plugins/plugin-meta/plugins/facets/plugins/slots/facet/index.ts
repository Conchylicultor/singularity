import { join } from "path";
import {
  createFacet,
} from "@plugins/plugin-meta/plugins/facets/core";
import {
  readIfExists,
  stripTypes,
  maskSource,
  parseDefineGroup,
  matchBracket,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type SlotDef, slotsFacetDef } from "../core";

function isSlotLike(v: unknown): v is { id: string } {
  return typeof v === "function" && typeof (v as any).id === "string" && typeof (v as any).useContributions === "function";
}

/**
 * Parse `defineRenderSlot(...)` calls. Mirrors `parseDefineGroup`, but render
 * slots aren't always assigned inside a `Member: builder(...)` group entry (some
 * are standalone, e.g. `VariantGroup: defineRenderSlot<T>("id", {...})`), and we
 * additionally need the optional 2nd-arg `{ reorder?: boolean }` which lives past
 * the id string. So we scan each `defineRenderSlot(` occurrence directly: take the
 * first string literal as the id, the nearest preceding `Member:` as the member
 * name, and read `reorder` from the call's argument span. Default `reorder: true`
 * when the option is absent.
 */
function parseRenderSlots(src: string): SlotDef[] {
  const out: SlotDef[] = [];
  const callRe = /defineRenderSlot\s*(?:<[^]*?>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src))) {
    const parenStart = src.indexOf("(", m.index + "defineRenderSlot".length - 1);
    if (parenStart < 0) continue;
    const parenEnd = matchBracket(src, parenStart, "(", ")");
    if (parenEnd < 0) continue;
    const argsBody = src.slice(parenStart + 1, parenEnd);

    const idMatch = /^\s*"([^"]+)"|^\s*'([^']+)'|^\s*`([^`]+)`/.exec(argsBody);
    const slotId = idMatch ? (idMatch[1] ?? idMatch[2] ?? idMatch[3]) : undefined;
    // Skip ids built from template/identifier expressions (e.g.
    // `${id}.section` inside defineDetailSections) — not statically resolvable.
    if (!slotId) continue;

    // The member/group name is the nearest `Word:` or `const Word =` before the call.
    const prefix = src.slice(0, m.index);
    const nameMatch = /(\w+)\s*:\s*$|(?:export\s+)?const\s+(\w+)\s*=\s*$/.exec(
      prefix.replace(/<[^>]*>\s*$/, ""),
    );
    const memberName =
      (nameMatch && (nameMatch[1] ?? nameMatch[2])) ?? slotId;
    // Group name: nearest enclosing `export const Group = {` if any, else member.
    const groupMatch = [...prefix.matchAll(/export\s+const\s+([A-Z]\w*)\s*=\s*\{/g)].pop();
    const groupName = groupMatch ? groupMatch[1]! : memberName;

    // `reorder: false` may appear anywhere in the options object (before or after
    // `docLabel`). Absence ⇒ default `true`.
    const reorder = !/\breorder\s*:\s*false\b/.test(argsBody);

    out.push({ memberName, slotId, groupName, kind: "render", reorder });
  }
  return out;
}

function safeEntries(obj: Record<string, unknown>): [string, unknown][] {
  try {
    return Object.entries(obj);
  } catch (err) {
    if (err instanceof TypeError) return [];
    throw err;
  }
}

/**
 * Best-effort `kind` (and `reorder`) for a slot surfaced only via the runtime
 * fallback. `defineRenderSlot` attaches a `.Render` component and
 * `defineDispatchSlot` a `.Dispatch` component to the slot object. The `reorder`
 * flag is closed over inside `.Render` and not observable at runtime, so render
 * slots discovered this way default to `reorder: true`.
 */
function runtimeKindHints(slot: { id: string }): Partial<SlotDef> {
  const s = slot as Record<string, unknown>;
  if (typeof s.Render === "function") return { kind: "render", reorder: true };
  if (typeof s.Dispatch === "function") return { kind: "dispatch" };
  return { kind: "slot" };
}

function collectRuntimeSlots(importedModules: { mod: Record<string, unknown> }[]): SlotDef[] {
  const seen = new Set<string>();
  const out: SlotDef[] = [];
  for (const { mod } of importedModules) {
    for (const [key, val] of safeEntries(mod)) {
      if (isSlotLike(val) && !seen.has(val.id)) {
        seen.add(val.id);
        out.push({ memberName: key, slotId: val.id, groupName: key, ...runtimeKindHints(val) });
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        for (const [member, inner] of safeEntries(val as Record<string, unknown>)) {
          if (isSlotLike(inner) && !seen.has(inner.id)) {
            seen.add(inner.id);
            out.push({ memberName: member, slotId: inner.id, groupName: key, ...runtimeKindHints(inner) });
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
      // stripTypes drops comments on the happy path; masking comments/regex
      // (keeping slot-id strings) additionally defends the transpile-failure
      // fallback so a commented `defineSlot("x")` is never parsed as a real slot.
      const stripped = maskSource(stripTypes(src), { strings: false });
      // Render slots first: they read the `reorder` flag and `defineSlot` would
      // not match `defineRenderSlot` calls anyway (distinct builder name).
      slots.push(...parseRenderSlots(stripped));
      slots.push(...parseDefineGroup(
        stripped,
        "defineSlot",
        (memberName, slotId, groupName): SlotDef => ({ memberName, slotId, groupName, kind: "slot" }),
      ));
      slots.push(...parseDefineGroup(
        stripped,
        "defineDispatchSlot",
        (memberName, slotId, groupName): SlotDef => ({ memberName, slotId, groupName, kind: "dispatch" }),
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
