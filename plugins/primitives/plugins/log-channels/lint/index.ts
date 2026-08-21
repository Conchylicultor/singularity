import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://internal/lint/log-channels/${name}`,
);

const noConsoleLog = createRule({
  name: "no-console-log",
  meta: {
    type: "problem",
    docs: { description: "Disallow console.log; use Log.channel() instead." },
    schema: [],
    messages: {
      noConsole: "Use a structured logger instead of console.log.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      "CallExpression[callee.object.name='console'][callee.property.name='log']"(
        node,
      ) {
        context.report({ node, messageId: "noConsole" });
      },
    };
  },
});

export default {
  name: "log-channels",
  rules: { "no-console-log": noConsoleLog },
  /**
   * Globs where `no-console-log` is not enforced, keyed by rule id. The root
   * eslint.config.ts reads this generically and flips the rule off for these
   * paths — it never names this rule or these files itself.
   */
  ignores: {
    "no-console-log": [
      // scripts/ — standalone, run-manually processes where console *is* the
      // logger (e.g. one-shot codegen). Permanent exemption.
      "**/scripts/**/*.{ts,tsx}",
      // bin/ — process entrypoints. CLI commands print to the developer's
      // terminal (the agent-visible channel — agents run `./singularity …` and
      // read stdout); the server/central daemon entrypoints are boot bootstrap
      // code whose stdout/stderr the gateway captures to
      // ~/.singularity/logs/gateway/<name>.log. console is the right sink for all of them.
      "**/bin/**/*.{ts,tsx}",
      // central/ — the host-wide central runtime. The per-worktree `logs` plugin
      // (which serves the Logs pane + read_logs JSONL) does not run there, so
      // console — captured to ~/.singularity/logs/gateway/central.log — is the sink.
      "**/central/**/*.{ts,tsx}",
      // provision/ — install-time provisioning contributions, discovered by the
      // provision runner and executed during the `bun install` postinstall. Same
      // standalone/server-less context as scripts/: no backend is running, so the
      // structured logger (which persists over HTTP to a live server) is
      // unreachable. console — captured by the install output — is the sink.
      "**/provision/**/*.{ts,tsx}",
      // e2e/ — Playwright scripts run by hand against a deployed app. They are
      // standalone processes OUTSIDE the server (no backend of their own to
      // POST to), and their entire output contract is the pass/fail transcript
      // the developer or agent reads on stdout. console is the sink.
      "**/e2e/**/*.{ts,tsx}",
      // cli/ — plugin-contributed `./singularity <verb>` commands. This is the
      // SAME case the `bin/` entry above already describes ("CLI commands print
      // to the developer's terminal"); commands simply live in `cli/` now that a
      // plugin can contribute one, rather than only in the framework CLI's
      // `bin/`. A command's entire output contract is the transcript a developer
      // or agent reads on stdout, and the structured logger is not merely the
      // wrong sink but an unreachable one on the paths that matter most — the
      // fresh-checkout bootstrap, an install, and a hermetic build all run with
      // no backend to POST to.
      "**/cli/**/*.{ts,tsx}",
    ],
  },
};
