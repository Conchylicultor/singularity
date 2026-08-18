import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge, getDefaultConfig } from "tailwind-merge";

import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import {
  CUSTOM_UTILITY_REGISTRY,
  type CustomGroupId,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/custom-utilities.generated";

// Derive the twMerge extension from the single-source registry so adding a custom
// @utility never requires a separate hand-edit of the conflict map (the coupling
// that let role utilities like `text-caption` get silently stripped). The registry
// is GENERATED from the `/* twmerge: … */` markers in app.css (the single source of
// truth) — see custom-utilities-types.ts for the wiring semantics.

// tailwind-merge reads `conflictingClassGroups[a] = [b]` as "a LATER class of group
// `a` removes an EARLIER class of group `b`" — one-directional. A synthetic group
// therefore needs BOTH entries to be mutually exclusive with a built-in; with only
// one, base-classes-first / caller-className-last (the repo's dominant order)
// leaves both classes alive and the CSS cascade decides. That is a real lie for a
// utility that publishes what it applies: `cn("px-md", "rail-lg")` used to keep
// both, so the element advertised `--rail-start: lg` while actually being padded
// `md`. `excludes:` emits both directions.
const DEFAULT_CONFIG = getDefaultConfig();
const DEFAULT_CONFLICTS: Record<string, readonly string[]> =
  DEFAULT_CONFIG.conflictingClassGroups;

// tailwind-merge's own map is the authority on how the built-in groups nest — `p`
// over `px` over `pr`/`pl`, `size` over `w`/`h` — so a group's declared relation is
// CLOSED over it rather than hand-listed. A hand list misses `ps`/`pe`/`pbs`/`pbe`
// (real 3.5.0 groups that aren't even spellable in BuiltinGroupId) and cannot
// follow tailwind-merge when it changes; a closure inherits its coverage exactly.
const REVERSE_CONFLICTS: Record<string, string[]> = {};
for (const [beater, beaten] of Object.entries(DEFAULT_CONFLICTS)) {
  for (const id of beaten) (REVERSE_CONFLICTS[id] ??= []).push(beater);
}

// Worklist + visited set, not recursion: the default map has genuine cycles
// (`fvn-normal` ↔ `fvn-ordinal`, `touch` ↔ `touch-x`, `translate` ↔
// `translate-none`), which a naive walk would not terminate on.
function closure(
  seeds: readonly string[],
  edges: Record<string, readonly string[]>,
): string[] {
  const seen = new Set<string>();
  const work = [...seeds];
  while (work.length > 0) {
    const id = work.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of edges[id] ?? []) work.push(next);
  }
  return [...seen];
}

/** Every group a later member of this group removes. */
const dominates = (ids: readonly string[]): string[] =>
  closure(ids, DEFAULT_CONFLICTS);

/** Every group whose later member removes this group. */
const dominatedBy = (ids: readonly string[]): string[] =>
  closure(ids, REVERSE_CONFLICTS);

// The built-in id allow-list the generator validates against is a hand-maintained
// copy (custom-utilities-gen.ts / custom-utilities-types.ts). This is the backstop
// that catches it diverging from the ids tailwind-merge actually ships: a group id
// that is not a real class group silently relates to nothing at all.
function assertRealGroup(id: string, where: string): void {
  if (!(id in DEFAULT_CONFIG.classGroups)) {
    throw new Error(
      `custom-utility group "${where}" names "${id}", which is not a tailwind-merge ` +
        `class group. Fix the "/* @twmerge group ${where} … */" declaration in app.css ` +
        `(or update the allow-list if tailwind-merge renamed the group).`,
    );
  }
}

const classGroups: Record<string, string[]> = {};
const conflictingClassGroups: Record<string, string[]> = {};

function addConflict(beater: string, beaten: string): void {
  const list = (conflictingClassGroups[beater] ??= []);
  if (!list.includes(beaten)) list.push(beaten);
}

for (const entry of CUSTOM_UTILITY_REGISTRY) {
  if ("extend" in entry) {
    (classGroups[entry.extend] ??= []).push(...entry.classes);
    continue;
  }
  // standalone entries are intentionally invisible to twMerge.
  if (!("group" in entry)) continue;

  // Append, never assign: the generator coalesces only CONSECUTIVE records, so a
  // group whose members sit in two non-adjacent runs of app.css emits two entries
  // with the same id — and an assignment would drop the first run's classes out of
  // twMerge entirely, silently.
  (classGroups[entry.group] ??= []).push(...entry.classes);

  for (const id of entry.excludes) assertRealGroup(id, entry.group);
  // Mutual: the group beats everything the listed built-ins beat, and everything
  // that beats the listed built-ins beats the group.
  for (const id of dominates(entry.excludes)) addConflict(entry.group, id);
  for (const id of dominatedBy(entry.excludes)) addConflict(id, entry.group);

  // `under`: the built-in is strictly broader, so it removes the group but the
  // group must not remove it — the group owns only part of what the built-in
  // writes, and the rest legitimately survives.
  for (const { group: id } of entry.under) {
    assertRealGroup(id, entry.group);
    for (const b of dominatedBy([id])) addConflict(b, entry.group);
  }
}

const twMerge = extendTailwindMerge<CustomGroupId>({
  extend: { classGroups, conflictingClassGroups },
});

/**
 * The one minter of a `ClassName` (see ui-kit's `core`). A field typed
 * `ClassName` cannot be filled with a bare literal, so its author has to route
 * the literal through here — which is precisely the `cn()` call anchor the
 * `no-adhoc-*` class rules already read tokens out of.
 *
 * `as ClassName` is deliberately the SINGLE cast to that type in the repo: grep
 * `as ClassName` and you have enumerated every way a class string can be minted
 * without passing the merge. Do not add a second one — call `cn()` instead.
 */
export function cn(...inputs: ClassValue[]): ClassName {
  return twMerge(clsx(inputs)) as ClassName;
}
