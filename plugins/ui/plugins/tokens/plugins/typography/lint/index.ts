import noArbitraryFontSize from "./no-arbitrary-font-size";

/**
 * First plugin-contributed lint barrel in the repo (see the typography density
 * plan, Part C.2). The root `eslint.config.ts` auto-discovers this default
 * export and registers `no-arbitrary-font-size` repo-wide as `error`.
 *
 * The rule enforces with ZERO exemptions: an arbitrary `text-[Npx]` size routes
 * to a named token (`text-3xs`/`text-2xs`/…) or the `<Text>` primitive. There is
 * intentionally no `ignores` allowlist.
 */
export default {
  name: "typography-tokens",
  rules: {
    "no-arbitrary-font-size": noArbitraryFontSize,
  },
};
