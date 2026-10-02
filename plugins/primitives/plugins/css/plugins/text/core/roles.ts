/**
 * The closed typographic role ladder — the ONE list every other typography
 * surface derives from: the `type-scale` token group's role keys, the
 * `text-<role>` / `text-<role>-compact` utilities in ui-kit's app.css, and the
 * `<Text variant>` union. A theme sets roles; a component picks a role; nothing
 * mints a component-named type token.
 *
 * Each role has a `fontSize<Role>` + `lineHeight<Role>` token pair, both LENGTHS
 * (so `--font-scale` multiplies them). `weight` says where the role's weight
 * comes from:
 * - a shared weight name (`bold` … `normal`): frozen in the role's utility,
 *   read from the shared `--font-weight-<name>` token;
 * - `"token"`: the role owns `fontWeight<Role>` (+ `fontWeight<Role>Strong`
 *   when `strong`), and a weight-only `font-<role>` utility carries it, so a
 *   control that swaps its size class keeps its weight.
 *
 * `compact` is the rung the role steps down to at the `xs` control density:
 * another role's (or the sub-scale's) metrics with this role's weight/tracking,
 * or `"own"` — the role has its own `fontSize<Role>Compact` /
 * `lineHeight<Role>Compact` tokens (`tag`: a theme needs its count chips a
 * half-step below the 2xs sub-scale).
 */
export const TYPE_ROLES = {
  // The display rung's weight is a token (default: bold) so a theme can set a
  // lighter headline (a document title) without re-weighting anything else.
  display: { weight: "token", compact: "title" },
  title: { weight: "semibold", compact: "heading" },
  heading: { weight: "semibold", compact: "subheading" },
  subheading: { weight: "semibold", compact: "body" },
  body: { weight: "normal", compact: "label" },
  label: { weight: "medium", compact: "caption" },
  // The heading of a group of rows in a list or sidebar (a quiet group header:
  // "Queue 14"). Its own role, not `label`, so a theme sizes its group heads
  // apart from the rows they head. Steps down to caption metrics at its weight.
  // Its weight is a token (default: semibold), so a theme sets quieter heads.
  group: { weight: "token", compact: "caption" },
  caption: { weight: "normal", compact: "2xs" },
  control: { weight: "token", strong: true, compact: "caption" },
  tag: { weight: "token", strong: true, compact: "own" },
  code: { weight: "normal", family: "mono", compact: "2xs" },
} as const;

/** A typographic role — the closed set `<Text variant>` and the tokens are built on. */
export type TypeRole = keyof typeof TYPE_ROLES;

/**
 * The sanctioned sub-scale below role granularity (`text-2xs` / `text-3xs`):
 * chip and badge internals, times. Tokens `font-size-<n>` / `line-height-<n>`.
 */
export const TYPE_SUBSCALE = ["2xs", "3xs"] as const;
export type TypeSubscale = (typeof TYPE_SUBSCALE)[number];

/**
 * `<Text>` variants that are NOT roles: treatments composed from a role's
 * utility (eyebrow = caption + small caps; count = compact control + tabular
 * figures). They own no tokens.
 */
export const TEXT_TREATMENTS = ["eyebrow", "count"] as const;
export type TextTreatment = (typeof TEXT_TREATMENTS)[number];

type RolesWithOwnCompact = {
  [R in TypeRole]: (typeof TYPE_ROLES)[R]["compact"] extends "own" ? R : never;
}[TypeRole];

/** Every scaled type var: a role's, an own compact rung's, or the sub-scale's. */
export type TypeVarName =
  | `${"font-size" | "line-height"}-${TypeRole | TypeSubscale}`
  | `${"font-size" | "line-height"}-${RolesWithOwnCompact}-compact`;

/**
 * A type-scale length var multiplied by the theme's `--font-scale` — the same
 * expression every role utility in app.css writes, for the rare TS consumer that
 * needs a role's raw metric (a block's bullet aligned to the body line height).
 * Reading `var(--line-height-body)` directly would skip the scale.
 */
export function typeVar(name: TypeVarName): string {
  return `calc(var(--${name}) * var(--font-scale))`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The type-scale token keys the ladder implies, derived from `TYPE_ROLES`:
 * `fontSize<Role>` + `lineHeight<Role>` for every role, `fontWeight<Role>`
 * (+ `Strong`) for a token-weight role, and the own compact rung's size pair.
 * The `type-scale` group asserts it declares every one of them.
 */
export function roleTokenKeys(): string[] {
  const keys: string[] = [];
  for (const [role, spec] of Object.entries(TYPE_ROLES)) {
    const r = capitalize(role);
    keys.push(`fontSize${r}`, `lineHeight${r}`);
    if (spec.weight === "token") {
      keys.push(`fontWeight${r}`);
      if ("strong" in spec && spec.strong) keys.push(`fontWeight${r}Strong`);
    }
    if (spec.compact === "own") {
      keys.push(`fontSize${r}Compact`, `lineHeight${r}Compact`);
    }
  }
  return keys;
}
