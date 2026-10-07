import {
  docFactValues,
  type DocFact,
  type DocFactGroup,
} from "@plugins/plugin-meta/plugins/facets/core";

/**
 * Longest list a plugin reference prints in full. A plugin's CLAUDE.md is
 * auto-loaded whenever an agent reads a file in it, so a fact past this is
 * summarized there — one count per group — and listed in full in the plugin's
 * `REFERENCE.md`, which agents open on demand.
 */
export const DOC_LIST_MAX = 20;

type GroupedFact = Extract<DocFact, { groups: DocFactGroup[] }>;

/**
 * Whether a fact is too long to print in full. Only a grouped fact qualifies:
 * the facet that groups its values is the one that says the list may be
 * summarized (a flat fact, such as a plugin's exports, is always complete).
 */
export function isSummarized(fact: DocFact): fact is GroupedFact {
  return "groups" in fact && docFactValues(fact).length > DOC_LIST_MAX;
}

/**
 * A summarized fact's lines, one per group, largest first (ties by label): a
 * group of one prints its value, since a count would hide less than it says;
 * a larger group prints `label ×N`.
 */
export function summaryLines(fact: GroupedFact): string[] {
  return fact.groups
    .filter((g) => g.values.length > 0)
    .sort(
      (a, b) =>
        b.values.length - a.values.length ||
        (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
    )
    .map((g) =>
      g.values.length === 1 ? g.values[0]! : `${g.label} ×${g.values.length}`,
    );
}

/** The summary's lead: `378 plugins`. */
export function summaryCount(fact: GroupedFact): string {
  return `${docFactValues(fact).length} ${fact.noun}`;
}
