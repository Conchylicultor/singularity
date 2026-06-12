import noAdhocSpacing from "./no-adhoc-spacing";

/**
 * Lint barrel for the `no-adhoc-spacing` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-spacing` repo-wide
 * as `error`.
 *
 * Layout spacing routes through the `<Stack gap>` / `<Inset pad>` primitives
 * (`@plugins/primitives/plugins/spacing/web`) or the matching `gap-<step>` /
 * `p-<step>` density utilities — never a raw `gap-2`/`px-3`/`mt-4`/`space-y-2`.
 *
 * BURNDOWN — DRAINED. The grandfathered allowlist (389 files that pre-dated the
 * rule) has been fully migrated to the spacing primitives / named utilities, so
 * the rule now enforces repo-wide with NO exemptions (the sanctioned empty state
 * — see build-lint-config.ts, which treats an empty glob array as "no allowlist").
 * Do NOT add entries back. A genuinely-fixed one-off escapes per-site, travelling
 * with the code:
 *
 *   // eslint-disable-next-line spacing/no-adhoc-spacing -- <reason>
 */
export default {
  name: "spacing",
  rules: {
    "no-adhoc-spacing": noAdhocSpacing,
  },
  ignores: {
    "no-adhoc-spacing": [],
  },
};
