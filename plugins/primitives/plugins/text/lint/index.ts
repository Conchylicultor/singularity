import noAdhocTypography from "./no-adhoc-typography";

/**
 * Lint barrel for the `no-adhoc-typography` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-typography`
 * repo-wide as `error`.
 *
 * The rule enforces with ZERO exemptions: text hierarchy routes through the
 * `<Text variant>` primitive (or the matching `text-{caption,body,label,…}`
 * token utility), never a raw named size (`text-{xs,sm,base,lg,xl,…}`) or a raw
 * `leading-*`. The sanctioned sub-scale `text-2xs`/`text-3xs` and color
 * utilities are not flagged. There is intentionally no `ignores` allowlist — a
 * genuinely-fixed raw size escapes per-site, travelling with the code:
 *
 *   // eslint-disable-next-line text/no-adhoc-typography -- <reason>
 */
export default {
  name: "text",
  rules: {
    "no-adhoc-typography": noAdhocTypography,
  },
};
