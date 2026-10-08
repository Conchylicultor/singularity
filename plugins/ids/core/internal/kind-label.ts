import type { AnyIdKind } from "./id-kind";

/**
 * The doc label an `IdKinds.Kind` contribution carries on either runtime:
 * `prefix`, then `|alias` for each alias (`att|claude`). It is what the
 * `ids:*` checks read off the docs facet — prefixes AND aliases — without
 * importing any barrel; `parseKindLabel` is its inverse.
 */
export function kindLabel(kind: AnyIdKind): string {
  return [kind.prefix, ...kind.aliases].join("|");
}

/** The inverse of {@link kindLabel}. */
export function parseKindLabel(label: string): {
  prefix: string;
  aliases: string[];
} {
  const [prefix = "", ...aliases] = label.split("|");
  return { prefix, aliases };
}
