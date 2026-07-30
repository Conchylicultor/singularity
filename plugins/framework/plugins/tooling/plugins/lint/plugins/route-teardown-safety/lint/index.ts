import noUnroute from "./no-unroute";

export default {
  name: "route-teardown-safety",
  rules: {
    "no-unroute": noUnroute,
  },
  /**
   * Enforced in e2e files, which contributed rules are otherwise off in (see
   * lint/core/non-app-globs.ts). Both conditions that exemption rests on fail
   * here:
   *
   *   - This is not an architecture rule. It catches a real BUG — a Playwright
   *     driver that tears down a route mid-flight releases the paused request
   *     early and reports success without ever exercising what it claims to
   *     verify. A verification script is cited as evidence; one that can go
   *     green while measuring nothing is worse than none.
   *   - The remedy IS reachable from the files it fires on. The usual problem
   *     is that a rule points at a `web` primitive an `e2e` file may not import;
   *     `stallRoute` lives in the e2e-harness's own `e2e` barrel, which every
   *     e2e file is free to import.
   *
   * e2e drivers are in fact the ONLY place `unroute` can appear at all — the
   * rule is repo-wide only so that stays true.
   */
  enforceEverywhere: ["no-unroute"],
};
