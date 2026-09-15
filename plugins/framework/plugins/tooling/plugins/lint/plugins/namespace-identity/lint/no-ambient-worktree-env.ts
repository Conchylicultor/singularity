import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * The retired variable, spelled literally.
 *
 * A rule file dual-loads under jiti (which cannot resolve `@plugins/*`) and Bun,
 * and an AST rule sees a name in the source rather than a binding — so the
 * spelling is the rule. That is exactly right here: the whole point is that this
 * name should not appear in code at all.
 */
const VAR = "SINGULARITY_WORKTREE";

/**
 * The files allowed to name it, as path SUFFIXES so they match whatever absolute
 * root the lint run has. Three, and each for a different reason:
 *
 * 1. `declare-namespace.ts` carries the gateway-restart transition branch —
 *    `./singularity build` rebuilds the backend but not the Go gateway, so until
 *    the user restarts it by hand a running gateway still sets the variable and
 *    passes no `--namespace`. That branch and this entry are deleted together
 *    once the gateway has been restarted.
 * 2. THIS FILE, which has to spell the name it bans. Rule files are linted
 *    repo-wide like any other source, so without the entry the rule reports
 *    itself — and the alternative, splitting the literal up to hide it from the
 *    matcher, would make the one place that defines the ban unreadable.
 * 3. Its test, whose fixtures are the ban's own worked examples.
 */
const ALLOWED_SUFFIXES = [
  "plugins/framework/plugins/server-core/bin/declare-namespace.ts",
  "plugins/framework/plugins/tooling/plugins/lint/plugins/namespace-identity/lint/no-ambient-worktree-env.ts",
  "plugins/framework/plugins/tooling/plugins/lint/plugins/namespace-identity/lint/no-ambient-worktree-env.test.ts",
] as const;

export default createRule({
  name: "no-ambient-worktree-env",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow naming the retired SINGULARITY_WORKTREE environment variable. " +
        "A runtime declares its namespace at its entry point; a CLI derives one " +
        "from its checkout.",
    },
    schema: [],
    messages: {
      ambientWorktreeEnv:
        '`SINGULARITY_WORKTREE` is retired. It answered "which namespace is this ' +
        'RUNTIME the server for", but an environment variable reaches every ' +
        "descendant forever — main's backend was the first process to talk to the " +
        "tmux server after a restart, so every agent session, and every build, " +
        "check and test those sessions ran, inherited main's identity and nothing " +
        "chose it. Ask the question you actually have instead. A RUNTIME (a " +
        "gateway-spawned backend, an exec child): `runtimeNamespace()` from " +
        "@plugins/infra/plugins/runtime-identity/core, declared once at the entry " +
        "point from the `--namespace` its spawner passed. A CLI acting on a " +
        "checkout: `checkoutNamespace(root)` / `checkoutWorktreeName(root)` from " +
        "@plugins/infra/plugins/paths/core. A child process you are spawning: pass " +
        "it `--namespace <ns>` on argv, never an env key.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (ALLOWED_SUFFIXES.some((s) => context.filename.endsWith(s))) return {};
    const report = (node: TSESTree.Node): void => {
      context.report({ node, messageId: "ambientWorktreeEnv" });
    };
    return {
      // `process.env.SINGULARITY_WORKTREE`, `{ SINGULARITY_WORKTREE: … }`, a
      // destructuring — every place the name is written as an identifier.
      Identifier(node: TSESTree.Identifier) {
        if (node.name === VAR) report(node);
      },
      // `process.env["SINGULARITY_WORKTREE"]`, `delete env[VAR]`, an `env:` key
      // written as a string, a spawn's `"SINGULARITY_WORKTREE=…"` is NOT matched
      // (it is not the bare name) — the bare string is, which is how every
      // dynamic read of it is spelled.
      Literal(node: TSESTree.Literal) {
        if (node.value === VAR) report(node);
      },
      TemplateElement(node: TSESTree.TemplateElement) {
        if (node.value.cooked === VAR) report(node);
      },
    };
  },
});
