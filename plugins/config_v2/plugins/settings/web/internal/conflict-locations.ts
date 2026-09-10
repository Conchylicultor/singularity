import type { ConfigV2ConflictLocations } from "@plugins/config_v2/core";

/**
 * The scopes a descriptor conflicts under, in tab order — `undefined` for the
 * base document, then each app scope id. Same shape the scope tabs are keyed by,
 * so "which tab do I send the user to" is a lookup, not a re-derivation.
 */
export function conflictScopes(
  conflict: ConfigV2ConflictLocations,
): (string | undefined)[] {
  return [...(conflict.base ? [undefined] : []), ...conflict.scopeIds];
}

/**
 * The one sentence describing WHERE a descriptor conflicts.
 *
 * Written once and read by every surface that paints the warning — the nav
 * row's tooltip and the detail pane's "it's under another tab" banner — so a
 * tooltip and a banner can never describe the same conflict two different ways.
 * Scope ids become app names through the caller's `scopeDisplay`, the same
 * resolver the scope tabs label themselves with.
 */
export function conflictSentence(
  conflict: ConfigV2ConflictLocations,
  scopeDisplay: (scopeId: string | undefined) => { label: string },
): string {
  const names = conflictScopes(conflict).map((sid) => scopeDisplay(sid).label);
  const plural = names.length === 1 ? "conflict" : "conflicts";
  // Only a scoped conflict needs the "which tab" hint: a base one is already
  // showing its banner on the tab the detail pane opens on.
  const hint =
    conflict.scopeIds.length === 0
      ? ""
      : names.length === 1
        ? " — open that tab to resolve it"
        : " — open each tab to resolve them";
  return `Unresolved config ${plural} in ${names.join(", ")}${hint}`;
}
