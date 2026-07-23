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
      // ~/.singularity/logs/<name>.log. console is the right sink for all of them.
      "**/bin/**/*.{ts,tsx}",
      // central/ — the host-wide central runtime. The per-worktree `logs` plugin
      // (which serves the Logs pane + read_logs JSONL) does not run there, so
      // console — captured to ~/.singularity/logs/central.log — is the sink.
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
    ],
  },
};
