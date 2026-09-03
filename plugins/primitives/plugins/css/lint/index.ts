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
  rules: {},
  // Class rules are FACTORIES: they read class tokens, so they take the one
  // shared walk from `buildLintConfig` instead of hand-copying it. See
  // @plugins/framework/plugins/tooling/plugins/lint/core/class-token-walk.ts.
  classRules: {
    "no-adhoc-layout": noAdhocLayout,
  },
  ignores: {
    "no-adhoc-layout": [
      // ── PERMANENT: the layout primitives themselves ──────────────────────
      "plugins/primitives/plugins/css/plugins/**/*.{ts,tsx}", // Grid/Cluster/Center/Overlay + presentational css/ sub-plugins (surface, card, text, spacing, badge, row, ...)
      "plugins/primitives/plugins/overlay/plugins/floating-action/web/internal/floating-action.tsx", // owns the morph/positioning mechanics (absolute panel, the rigid `trigger` collapsed-footprint wrapper) — a layout primitive, never drains
      // The sanctioned home for the body-portaled `position: fixed` mechanic: a
      // cursor-anchored menu. It owns the raw inline `position: fixed`; everyone
      // else routes through it. (The off-screen measure strip used to sit beside
      // it here — it is gone, along with the render-everything-twice measurement
      // it existed to serve. See `primitives/adaptive-bar`, which measures the
      // real nodes in place.)
      "plugins/primitives/plugins/overlay/plugins/cursor-menu/**",
      // Two more layout primitives that live outside `css/plugins/` and so were
      // never covered by the glob above. They were not previously listed because
      // they were not previously VISIBLE: each parks its mechanics in a
      // module-level class const, which no rule could read until the shared
      // class-token walk started following same-file aliases. They own what they
      // spell — `absolute inset-0` IS the surface-overlay, and the
      // overflow/space-sharing recipe IS the adaptive bar — so they belong in
      // this permanent tier beside floating-action, not in a drain queue.
      "plugins/primitives/plugins/overlay/plugins/surface-overlay/web/internal/surface-overlay.tsx",
      "plugins/primitives/plugins/adaptive-bar/web/internal/adaptive-bar.tsx",
      // ── REVERTED: restored to ad-hoc layout when the <Frame> primitive was
      //    removed. These files were migrated onto <Frame> during the drain;
      //    reverting that migration to their original markup re-introduces the
      //    raw flex/grid utilities, re-allowlisted here. ──────────────────────
    ],
  },
};
