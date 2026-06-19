import noAdhocLayout from "./no-adhoc-layout";

/**
 * Lint barrel for the `no-adhoc-layout` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-layout` repo-wide
 * as `error`.
 *
 * Layout composition routes through the layout primitives — `<Frame>` (named
 * slots, owns the shrink hierarchy), `<Grid>`/`<Cluster>`/`<Center>`/`<Overlay>`
 * (@plugins/primitives/plugins/css/plugins/*), `<Stack>`/`<Inset>`
 * (@plugins/primitives/plugins/css/plugins/spacing/web), and `<TruncatingText>` (the only
 * home for `min-w-0`) — never raw `flex`/`grid`/`items-*`/`absolute`/`overflow-*`.
 *
 * The `ignores` array below has two tiers:
 *
 *   1. PERMANENT — the layout primitives THEMSELVES. They own the raw mechanics
 *      the rule redirects to; they will never migrate (they ARE the
 *      implementation). These globs stay forever.
 *
 *   2. BURNDOWN — DRAINED. The grandfathered allowlist (471 files that pre-dated
 *      the rule) has been fully migrated to the layout primitives (Frame / Grid /
 *      Cluster / Center / Overlay / Scroll / Clip / Sticky / Pin / Stack), so the
 *      rule now enforces repo-wide with only the PERMANENT primitive exemption
 *      above. Do NOT add entries back. A genuinely-fixed one-off escapes per-site,
 *      travelling with the code:
 *
 *        // eslint-disable-next-line layout/no-adhoc-layout -- <reason>
 */
export default {
  name: "layout",
  rules: {
    "no-adhoc-layout": noAdhocLayout,
  },
  ignores: {
    "no-adhoc-layout": [
      // ── PERMANENT: the layout primitives themselves ──────────────────────
      "plugins/primitives/plugins/css/plugins/**/*.{ts,tsx}", // Frame/Grid/Cluster/Center/Overlay + presentational css/ sub-plugins (surface, card, truncating-text, spacing, badge, row, ...)
      "plugins/primitives/plugins/floating-action/web/internal/floating-action.tsx", // owns the morph/positioning mechanics (absolute panel, the rigid `trigger` collapsed-footprint wrapper) — a layout primitive, never drains
      // ── BURNDOWN: FULLY DRAINED (471 → 0). No entries — the rule enforces
      //    repo-wide with only the PERMANENT primitive exemption above. ────────
    ],
  },
};
