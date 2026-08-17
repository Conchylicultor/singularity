import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

// A LEAF on purpose: module eval depends on nothing but a type import, so the
// build-time collectors (the slots facet, the codegen declaration guard) can
// read this contract without pulling `web-sdk/core` — and with it React — into
// their module graph. Importing React before `registerBarrelStubs` runs would
// bind the real package ahead of the stub the whole barrel-import phase relies
// on.

/**
 * What a slot IS, carried on the slot object itself.
 *
 * Before this existed, "which constructor made this slot" was recoverable only
 * by sniffing which render method got attached (`.Render` → render slot) or by
 * grepping for the constructor's NAME in source text — and
 * `defineOrderedDispatchSlot`, whose runtime is literally `defineDispatchSlot`,
 * had no runtime evidence of its own identity at all. `reorderable` was likewise
 * trapped inside `defineRenderSlot`'s closure. Both are now facts on the object,
 * so every consumer reads one field instead of re-deriving the answer.
 */
export interface SlotMeta {
  kind: "slot" | "render" | "mount" | "wrap" | "dispatch" | "ordered-dispatch";
  /**
   * Whether this slot's contributions are user-orderable (and therefore owe a
   * reorder config directive). True for render and ordered-dispatch slots.
   */
  reorderable: boolean;
}

/**
 * The runtime-erased view of a slot — everything a slot-SET consumer (the
 * declaration guard, the slots facet, the reorder registry) needs, without the
 * props generic. Every {@link import("./slots").Slot} is one of these.
 */
export interface SlotHandle {
  id: string;
  meta: SlotMeta;
  /**
   * The plugin that DECLARED this slot, stamped by `PluginProvider` from the
   * declaring plugin's id (see `PluginDefinition.slots`). Ownership is read off
   * the declaration, never off "whoever imported the module first", so it can
   * neither depend on module-cache order nor be contested — exactly one plugin
   * may declare a slot (enforced by {@link declarePluginSlots}).
   */
  _pluginId?: PluginId;
}

/**
 * What a plugin may list in its `slots` array: a slot itself, or an object whose
 * own enumerable values include slots — a slot group (`export const Studio = {…}`),
 * a `definePaneToolbar()` result, a pane (whose `Actions` slot is an own value).
 *
 * Normalised exactly ONE shallow level. That shortcut is safe precisely because
 * anything nested deeper is not silently lost: it stays in `created \ declared`
 * and the build-time orphan guard names it, so the author declares it explicitly.
 */
export type SlotSource = SlotHandle | object;

// Every slot ever constructed, in construction order. Appended by `defineSlot`,
// which EVERY slot constructor funnels through — so this set needs no registry
// to keep in sync and nothing for an author to remember.
const createdSlots: SlotHandle[] = [];

/** Internal: called by `defineSlot` for every slot, once, at construction. */
export function recordCreatedSlot(slot: SlotHandle): void {
  createdSlots.push(slot);
}

/**
 * Every slot constructed SO FAR in this runtime.
 *
 * Complete only where module loading is complete — true in the build-time
 * codegen process (which imports every barrel), NOT mid-boot in the browser,
 * where web plugins load in tiers (`load-tiers.ts`). Consumers that need
 * completeness must run where it holds; see the orphan guard in codegen.
 */
export function getCreatedSlots(): readonly SlotHandle[] {
  return createdSlots;
}

/** Whether `v` is a slot (a callable carrying `id` + `meta` + `useContributions`). */
export function isSlot(v: unknown): v is SlotHandle {
  if (typeof v !== "function") return false;
  const s = v as Partial<SlotHandle> & { useContributions?: unknown };
  return (
    typeof s.id === "string" &&
    typeof s.useContributions === "function" &&
    typeof s.meta === "object" &&
    s.meta !== null
  );
}

/**
 * Normalise one plugin's `slots` array into the slots it declares — one shallow
 * level, deduped by identity.
 *
 * Throws on an entry that yields nothing: an entry the author believed carried
 * slots but does not is a mistake, and returning `[]` would turn it into a
 * missing declaration diagnosed far away (as an orphan) instead of here, where
 * the offending entry is still in hand.
 */
export function collectSlots(
  owner: string,
  sources: readonly SlotSource[],
): SlotHandle[] {
  const out: SlotHandle[] = [];
  const seen = new Set<SlotHandle>();
  const push = (slot: SlotHandle): void => {
    if (seen.has(slot)) return;
    seen.add(slot);
    out.push(slot);
  };

  for (let i = 0; i < sources.length; i++) {
    // Read as `unknown`: `slots` is authored data, so the runtime shape is what
    // decides, not the declared type.
    const source: unknown = sources[i];
    if (isSlot(source)) {
      push(source);
      continue;
    }
    if (source === null || typeof source !== "object") {
      throw new Error(
        `[plugin.${owner}] slots[${i}] is ${source === null ? "null" : typeof source} — ` +
          `expected a slot, or an object whose own values are slots.`,
      );
    }
    const found = Object.values(source as Record<string, unknown>).filter(
      isSlot,
    );
    if (found.length === 0) {
      throw new Error(
        `[plugin.${owner}] slots[${i}] declares no slots — it is neither a slot nor an ` +
          `object with slot-valued own properties. Slot sources are read ONE level deep; ` +
          `a slot nested deeper must be listed on its own.`,
      );
    }
    for (const slot of found) push(slot);
  }
  return out;
}

/**
 * Read a plugin's slot declaration off an imported module record — the ONE
 * definition of where a declaration lives, shared by the slots facet and the
 * build-time guard so they cannot look in different places.
 *
 * Normally it is `default.slots`, the `PluginDefinition` field. A module with no
 * default export at all declares via a named `slots` export instead: that is how
 * a plugin whose loaded module is not a `PluginDefinition` — web-sdk itself, which
 * has no `web/index.ts` because it IS the web runtime — still declares the slots
 * it owns. Returns `null` when the module declares nothing.
 */
export function declaredSlotSources(
  mod: Record<string, unknown>,
): SlotSource[] | null {
  const def: unknown = mod.default;
  if (def !== undefined) {
    if (def === null || typeof def !== "object") return null;
    const declared = (def as { slots?: unknown }).slots;
    return Array.isArray(declared) ? (declared as SlotSource[]) : null;
  }
  const named: unknown = mod.slots;
  return Array.isArray(named) ? (named as SlotSource[]) : null;
}

/** A plugin as the declaration pass sees it: its id plus what it declares. */
export interface SlotDeclaringPlugin {
  id: PluginId;
  slots?: SlotSource[];
}

/**
 * Notified at the end of every declaration pass with the complete owners map.
 *
 * The seam exists because a slot's OWNER is not known at construction — a slot
 * object is minted when its module evaluates, and which plugin owns it is only
 * settled when that plugin's definition is read. Anything derived per owned slot
 * (reorder's config descriptors and their registrations) therefore has exactly
 * one correct moment to (re)derive itself, and this is it: after the stamps, and
 * before `PluginProvider` reads any plugin's `contributions`.
 *
 * It is also what makes the browser's TIERED loading correct: each deferred
 * batch runs a fresh declaration pass over the grown plugin set, so a derived
 * registry catches up instead of being frozen at the first module's eval.
 */
export type SlotDeclarationListener = (
  owners: ReadonlyMap<string, PluginId>,
) => void;

const declarationListeners = new Set<SlotDeclarationListener>();
let lastOwners: ReadonlyMap<string, PluginId> = new Map();

/**
 * Subscribe to declaration passes. The listener is invoked immediately with the
 * latest owners map (empty before the first pass), so a subscriber that
 * registers late is never one pass behind.
 */
export function subscribeSlotsDeclared(
  listener: SlotDeclarationListener,
): () => void {
  declarationListeners.add(listener);
  listener(lastOwners);
  return () => {
    declarationListeners.delete(listener);
  };
}

/**
 * Build the slotId → declaring-plugin map across every loaded plugin, stamping
 * `_pluginId` onto each slot OBJECT (not a copy — the reorder middleware looks
 * descriptors up by reference identity, so the slot every consumer holds must be
 * the one carrying the owner).
 *
 * Two plugins declaring the same slot throws. That is what makes stamping the
 * shared object safe: exactly one plugin may claim a slot, so the stamp can
 * never be contested. It also closes today's silent "first definer wins" dedupe.
 *
 * Idempotent: re-running over a superset of plugins (the browser appends each
 * deferred batch) re-derives the same map and re-writes the same stamps.
 */
export function declarePluginSlots(
  plugins: readonly SlotDeclaringPlugin[],
): Map<string, PluginId> {
  const owners = new Map<string, PluginId>();
  for (const plugin of plugins) {
    if (!plugin.slots || plugin.slots.length === 0) continue;
    for (const slot of collectSlots(plugin.id, plugin.slots)) {
      const existing = owners.get(slot.id);
      if (existing !== undefined && existing !== plugin.id) {
        throw new Error(
          `[slots] slot "${slot.id}" is declared by two plugins: ` +
            `"${existing}" and "${plugin.id}". Exactly one plugin owns a slot — ` +
            `the other should import it, not declare it.`,
        );
      }
      owners.set(slot.id, plugin.id);
      slot._pluginId = plugin.id;
    }
  }
  lastOwners = owners;
  for (const listener of declarationListeners) listener(owners);
  return owners;
}

/**
 * `created \ declared` — every slot constructed in this runtime that no plugin
 * declared. Non-empty is an error at the one place both sets are complete (the
 * build-time codegen process); the caller formats and throws, because it is the
 * one that can attribute each orphan to a source location.
 */
export function findUndeclaredSlots(
  owners: ReadonlyMap<string, PluginId>,
): SlotHandle[] {
  return getCreatedSlots().filter((slot) => !owners.has(slot.id));
}
