import { defineCliCommand } from "@plugins/framework/plugins/cli/core";
import { CHECK_SCOPES } from "@plugins/framework/plugins/tooling/core";

/**
 * The repo's verdict, as a command. `build` and `push` do not re-implement it —
 * they spawn this same command in a subprocess, so the `checks ✓` all three
 * print is one claim rather than three implementations that could drift.
 *
 * The declaration exercises the two commander shapes nothing else in the CLI
 * needed: a VARIADIC positional (`[checks...]`, which commander hands the action
 * as a `string[]` — empty, never undefined, when no id is typed) and a NEGATABLE
 * flag (`--no-cache`, which commander binds to a `cache` property that is `true`
 * by default and `false` only when the flag is passed — hence the action's
 * `opts.cache === false` rather than a truthiness test).
 *
 * `--scope`'s help interpolates {@link CHECK_SCOPES} so the listed scopes cannot
 * fall behind the set the action validates against. That import is a `core`
 * barrel with one type-only edge of its own, so this declaration still reaches
 * no npm package and no `web`/`server` barrel — `cli:command-declarations-light`
 * holds.
 */
export default defineCliCommand<
  [string[]],
  {
    list?: boolean;
    status?: boolean;
    cache?: boolean;
    scope?: string;
    alwaysRun?: boolean;
    runId?: string;
  }
>({
  name: "check",
  description: "Run repo validation checks",
  arguments: [
    { name: "[checks...]", description: "Check IDs to run (default: all)" },
  ],
  options: [
    { flags: "--list", description: "List available checks and exit" },
    {
      flags: "--status",
      description:
        "Print in-flight check runs from the durable progress log and exit. A pure read: " +
        "acquires no host grant and runs no check, so it answers from a second shell while " +
        "a run is wedged — naming the check(s) that started and never settled.",
    },
    {
      flags: "--no-cache",
      description: "Bypass the tree-hash check-result cache",
    },
    {
      flags: "--scope <scope>",
      description:
        `Run only checks of this scope (${CHECK_SCOPES.join(" | ")}); default: every scope. ` +
        "`tree` = the verdict is a function of the tree content, i.e. of what a push carries; " +
        "`deploy` = it verifies the local gitignored dist/artifact store `build` produces. " +
        "`--scope tree` reproduces the pass `./singularity push` runs.",
    },
    {
      flags: "--always-run",
      description:
        "Run only the checks flagged `alwaysRun` — the cheap structural subset a " +
        "`build --skip-checks` still proves. By PROPERTY, never by id, so deleting the " +
        "last such check fails loudly instead of quietly proving less. Composes with " +
        "--scope (AND).",
    },
    {
      flags: "--run-id <id>",
      description:
        "Adopt the calling op's run id, so this run's own check transcript, its progress records " +
        "and the console all name the parent op. Only valid for a nested check (one that " +
        "inherited a parent's host grant) — a top-level check must mint its own.",
    },
  ],
  run: () => import("./run"),
});
