import noNetworkidle from "./no-networkidle";

export default {
  name: "e2e-harness",
  rules: {
    "no-networkidle": noNetworkidle,
  },
  /**
   * Enforced in e2e files, which contributed rules are otherwise off in (see
   * lint/core/non-app-globs.ts) — they are the ONLY files it fires on (the rule
   * checks the path itself). Not an architecture rule: it catches a wait that
   * times out on every run, and its remedy lives in the harness's own `e2e`
   * barrel, which every e2e file may import.
   */
  enforceEverywhere: ["no-networkidle"],
};
