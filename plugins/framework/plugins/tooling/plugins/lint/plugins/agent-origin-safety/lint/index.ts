import noUnmarkedAppFetch from "./no-unmarked-app-fetch";

export default {
  name: "agent-origin-safety",
  rules: {
    "no-unmarked-app-fetch": noUnmarkedAppFetch,
  },
  ignores: {
    // `agentFetch` is the one sanctioned home for the idiom — it IS the marked
    // fetch the rule points everyone at, so it necessarily contains the
    // unmarked one.
    "no-unmarked-app-fetch": [
      "plugins/framework/plugins/tooling/plugins/e2e-harness/e2e/app-fetch.ts",
    ],
  },
  /**
   * Enforced in e2e files, which contributed rules are otherwise off in (see
   * lint/core/non-app-globs.ts). The same two conditions that justify
   * `route-teardown-safety/no-unroute` hold here:
   *
   *   - This is not an architecture rule. It catches a real defect with a
   *     silent failure mode: a Node-side `fetch` to the app carries no
   *     agent-origin header, so the pages it creates are never swept and the
   *     config it writes is never reverted — the user's settings stay changed
   *     after the run, and the run reports success either way.
   *   - The remedy is reachable from the files it fires on. `agentFetch` lives
   *     in the e2e-harness's own `e2e` barrel, which every e2e file may import.
   *
   * The rule additionally scopes itself to `/e2e/` by filename: repo-wide is
   * how it reaches e2e at all, not a claim about server or web code.
   */
  enforceEverywhere: ["no-unmarked-app-fetch"],
};
