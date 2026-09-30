import noSystemPython from "./no-system-python";

export default {
  name: "python",
  rules: {
    "no-system-python": noSystemPython,
  },
  /**
   * Enforced in tests too: a test that runs the machine's Python is exactly how
   * the "install the command line developer tools" dialog reached a user's
   * screen (run-python.test.ts once linked `bin/python` to /usr/bin/python3).
   */
  enforceEverywhere: ["no-system-python"],
  /**
   * Globs where the rule is not enforced, keyed by rule id.
   *
   * - The Claude Code guards parse agents' shell commands as DATA (`python3 -
   *   <<'PY'` is a command they classify, never run), and poll-detect lists
   *   interpreter names to recognise.
   * - The rule's own tests hold its forbidden spellings as fixtures.
   */
  ignores: {
    "no-system-python": [
      "plugins/framework/plugins/tooling/plugins/guards/core/**",
      "plugins/infra/plugins/deps/plugins/python/lint/no-system-python.test.ts",
    ],
  },
};
