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
 * Parse `defineRenderSlot(...)` / `defineMountSlot(...)` calls. Mirrors
 * `parseDefineGroup`, but these slots aren't always assigned inside a
 * `Member: builder(...)` group entry (some are standalone, e.g.
 * `VariantGroup: defineRenderSlot<T>("id", {...})`). So we scan each builder
 * occurrence directly: take the first string literal as the id and the nearest
 * preceding `Member:` (or `const Member =`) as the member name. `kind` is fixed
 * by the builder — `"render"` (always reorderable) or `"mount"` (never).
 */
function parseSlotCalls(
  src: string,
  builder: "defineRenderSlot" | "defineMountSlot" | "defineWrapperSlot",
  kind: "render" | "mount" | "wrap",
): SlotDef[] {
  const out: SlotDef[] = [];
  const callRe = new RegExp(`${builder}\\s*(?:<[^]*?>)?\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src))) {
    const parenStart = src.indexOf("(", m.index + builder.length - 1);
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

    out.push({ memberName, slotId, groupName, kind, contributors: [] });
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
 * Best-effort `kind` for a slot surfaced only via the runtime fallback.
 * `defineRenderSlot` attaches a `.Render` component, `defineMountSlot` a
 * `.Mount` component, `defineDispatchSlot` a `.Dispatch` component, and
 * `defineWrapperSlot` a `.Wrap` component to the slot object.
 */
function runtimeKindHints(slot: { id: string }): Partial<SlotDef> {
  const s = slot as Record<string, unknown>;
  if (typeof s.Mount === "function") return { kind: "mount" };
  if (typeof s.Render === "function") return { kind: "render" };
  if (typeof s.Dispatch === "function") return { kind: "dispatch" };
  if (typeof s.Wrap === "function") return { kind: "wrap" };
  return { kind: "slot" };
}

/**
 * Whether a value is a plain-ish object we should recurse into. Excludes arrays
 * and React elements (objects carrying a `$$typeof` symbol) so the walk never
 * descends into element trees.
 */
function isWalkableObject(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  if ("$$typeof" in (val as Record<string | symbol, unknown>)) return false;
  return true;
}

/**
 * Full-depth recursive walk over each barrel module's export object graph. A
 * slot can be exposed at any nesting depth — e.g. a factory result nested under
 * an export object (`Sonata.Toolbar.Start`) — so we descend until we hit a
 * slot, recording it (deduped by id) without recursing into it. A `WeakSet`
 * guards against cycles and re-visiting shared objects.
 */
function collectRuntimeSlots(importedModules: { mod: Record<string, unknown> }[]): SlotDef[] {
  const seen = new Set<string>();
  const out: SlotDef[] = [];
  const visited = new WeakSet<object>();

  // `groupName` is the top-level export key under which a slot is found;
  // `memberName` is the immediate parent key. For a top-level slot both equal
  // the key; for a slot inside a group object member = its key, group = the
  // export key; deeper still, member = the immediate key, group = the export key.
  function walk(obj: Record<string, unknown>, groupName: string): void {
    for (const [key, val] of safeEntries(obj)) {
      if (isSlotLike(val)) {
        if (!seen.has(val.id)) {
          seen.add(val.id);
          out.push({ memberName: key, slotId: val.id, groupName, contributors: [], ...runtimeKindHints(val) });
        }
      } else if (isWalkableObject(val) && !visited.has(val)) {
        visited.add(val);
        walk(val, groupName);
      }
      // functions that aren't slots, primitives, arrays, React elements → ignore
    }
  }

  for (const { mod } of importedModules) {
    for (const [key, val] of safeEntries(mod)) {
      if (isSlotLike(val)) {
        if (!seen.has(val.id)) {
          seen.add(val.id);
          out.push({ memberName: key, slotId: val.id, groupName: key, contributors: [], ...runtimeKindHints(val) });
        }
      } else if (isWalkableObject(val) && !visited.has(val)) {
        visited.add(val);
        walk(val, key);
      }
    }
  }
  return out;
}

export default createFacet<SlotDef[]>({
  def: slotsFacetDef,

  extract(ctx) {
    // Two discovery modes:
    //  - Imports present (the normal build): the runtime walk over the barrel
    //    export graph is the SOLE authoritative source. It sees every slot at
    //    any nesting depth — including factory-produced slots (e.g.
    //    `Sonata.Toolbar.Start`) that no static text parse could reach — and
    //    reads each slot's `kind` from its constructor marker (`.Mount` →
    //    mount, `.Render` → render, `.Dispatch` → dispatch).
    //  - No imports (`skipBarrelImport` build mode): fall back to the static
    //    text parse of `web/slots.ts`. This cannot see factory slots (their
    //    `defineRenderSlot` call lives in the factory file, not `slots.ts`), but
    //    it is the only option when barrels aren't imported.
    if (ctx.importedModules && ctx.importedModules.length > 0) {
      return collectRuntimeSlots(ctx.importedModules);
    }

    const slots: SlotDef[] = [];
    const src = readIfExists(join(ctx.dir, "web", "slots.ts"));
    if (src) {
      // stripTypes drops comments on the happy path; masking comments/regex
      // (keeping slot-id strings) additionally defends the transpile-failure
      // fallback so a commented `defineSlot("x")` is never parsed as a real slot.
      const stripped = maskSource(stripTypes(src), { strings: false });
      // Render and mount slots first: scanned by builder name (distinct from
      // `defineSlot`, so the group parser below won't double-count them).
      slots.push(...parseSlotCalls(stripped, "defineRenderSlot", "render"));
      slots.push(...parseSlotCalls(stripped, "defineMountSlot", "mount"));
      slots.push(...parseSlotCalls(stripped, "defineWrapperSlot", "wrap"));
      slots.push(...parseDefineGroup(
        stripped,
        "defineSlot",
        (memberName, slotId, groupName): SlotDef => ({ memberName, slotId, groupName, kind: "slot", contributors: [] }),
      ));
      slots.push(...parseDefineGroup(
        stripped,
        "defineDispatchSlot",
        (memberName, slotId, groupName): SlotDef => ({ memberName, slotId, groupName, kind: "dispatch", contributors: [] }),
      ));
    }
    return slots;
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
          const head = `\`${s.groupName}.${s.memberName}\``;
          if (s.contributors.length === 0) return head;
          return `${head} ← ${s.contributors.map((id) => `\`${id}\``).join(", ")}`;
        }),
      },
    ];
  },
});
