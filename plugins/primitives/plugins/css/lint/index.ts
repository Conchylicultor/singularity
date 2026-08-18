import noAdhocLayout from "./no-adhoc-layout";

/**
 * Lint barrel for the `no-adhoc-layout` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-layout` repo-wide
 * as `error`.
 *
 * Layout composition routes through the layout primitives —
 * `<Stack>`/`<Cluster>`/`<Row>` (rows), `<Grid>`/`<Center>`/`<Overlay>`
 * (@plugins/primitives/plugins/css/plugins/*), `<Stack>`/`<Inset>`
 * (@plugins/primitives/plugins/css/plugins/spacing/web), and `<Text>` inside a line
 * container (the only home for `min-w-0`) — never raw `flex`/`grid`/`items-*`/`absolute`/`overflow-*`.
 *
 * The `ignores` array below has two tiers:
 *
 *   1. PERMANENT — the layout primitives THEMSELVES. They own the raw mechanics
 *      the rule redirects to; they will never migrate (they ARE the
 *      implementation). These globs stay forever.
 *
 *   2. REVERTED — files restored to ad-hoc layout when the `<Frame>` named-slot
 *      row primitive was removed. They had been migrated onto `<Frame>` during the
 *      drain; reverting that migration re-introduces the raw flex/grid utilities,
 *      so they are re-allowlisted here. A genuinely-fixed one-off escapes per-site,
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
      "plugins/primitives/plugins/css/plugins/**/*.{ts,tsx}", // Grid/Cluster/Center/Overlay + presentational css/ sub-plugins (surface, card, text, spacing, badge, row, ...)
      "plugins/primitives/plugins/floating-action/web/internal/floating-action.tsx", // owns the morph/positioning mechanics (absolute panel, the rigid `trigger` collapsed-footprint wrapper) — a layout primitive, never drains
      // The sanctioned home for the body-portaled `position: fixed` mechanic: a
      // cursor-anchored menu. It owns the raw inline `position: fixed`; everyone
      // else routes through it. (The off-screen measure strip used to sit beside
      // it here — it is gone, along with the render-everything-twice measurement
      // it existed to serve. See `primitives/adaptive-bar`, which measures the
      // real nodes in place.)
      "plugins/primitives/plugins/cursor-menu/**",
      // ── REVERTED: restored to ad-hoc layout when the <Frame> primitive was
      //    removed. These files were migrated onto <Frame> during the drain;
      //    reverting that migration to their original markup re-introduces the
      //    raw flex/grid utilities, re-allowlisted here. ──────────────────────
    ],
  },
};
