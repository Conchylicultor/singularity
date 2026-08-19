import noAdhocPathResolve from "./no-adhoc-path-resolve";

export default {
  name: "guard-path-safety",
  rules: {
    "no-adhoc-path-resolve": noAdhocPathResolve,
  },
  /**
   * Globs where the rule is not enforced, keyed by rule id. The root
   * eslint.config reads this generically and flips the rule off for these paths
   * — it never names this rule or these files itself.
   *
   * The rule fences `guards/core/guards/**` against building a filesystem path,
   * because a path a guard builds is a path whose starting operand it guessed out
   * of `call.args`.
   *
   * Every production exemption must clear ONE bar: the path being built cannot
   * derive from a shell command's arguments, so the guessing failure mode the
   * rule exists to close cannot occur there. That is a checkable property, not a
   * judgement call — a new guard that wants a path OUT OF A COMMAND does not
   * qualify, however inconvenient, and belongs in `core/argv.ts` instead.
   *
   *   - `main-edits.ts` guards the Write/Edit tools, not Bash. Its input is a
   *     structured tool payload with a `file_path` field the harness supplies —
   *     one declared path, already unambiguous. There are no shell operands in
   *     that guard at all, so there is no argv grammar for `core/argv.ts` to
   *     apply and nothing for it to hand back.
   *   - `git-diff-main.ts` composes the path of its own once-per-session marker
   *     file from `ctx.cwd`. That is the guard's private bookkeeping on disk, not
   *     a path it compares a command against — the command's own arguments never
   *     reach it.
   *   - `poll-loop.ts` does the same with its per-session state file under
   *     `tmpdir()`. Nothing it joins comes from the command being judged.
   *
   * Test files are exempt for the same reason as `sink-safety`'s rules: the
   * invariant is about the PRODUCTION guards, and a suite legitimately imports
   * `join` to build a fixture path or an expected value. (Contributed rules are
   * already off in NON_APP_FILE_GLOBS by default; the entry is here so the
   * exemption stays true if this rule is ever opted into `enforceEverywhere`.)
   */
  ignores: {
    "no-adhoc-path-resolve": [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/guards/core/guards/main-edits.ts",
      "**/guards/core/guards/git-diff-main.ts",
      "**/guards/core/guards/poll-loop.ts",
    ],
  },
};
