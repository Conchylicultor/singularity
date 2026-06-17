import noAdhocRadius from "./no-adhoc-radius";

/**
 * Lint barrel for the `no-adhoc-radius` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-radius` repo-wide
 * as `error`.
 *
 * The rule enforces with ZERO exemptions: every corner routes through the
 * token-driven `rounded-{sm,md,lg,…}` scale (or an intentional
 * `rounded-full`/`rounded-none`) so Shape presets rescale the whole app at once.
 * There is intentionally no `ignores` allowlist — a genuinely-fixed literal
 * shape escapes per-site, travelling with the code:
 *
 *   // eslint-disable-next-line radius/no-adhoc-radius -- <reason>
 */
export default {
  name: "radius",
  rules: {
    "no-adhoc-radius": noAdhocRadius,
  },
};
