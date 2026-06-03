import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://internal/lint/debug-logs/${name}`,
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
  name: "debug-logs",
  rules: { "no-console-log": noConsoleLog },
  /**
   * Globs where `no-console-log` is not enforced, keyed by rule id. The root
   * eslint.config.ts reads this generically and flips the rule off for these
   * paths — it never names this rule or these files itself.
   */
  ignores: {
    "no-console-log": [
      // scripts/ are standalone boot/CLI processes where console *is* the
      // logger. Permanent exemption.
      "**/scripts/**/*.{ts,tsx}",
      // Temporary allowlist — these predate the rule going repo-wide. Migrate
      // them to the structured logger, then delete each entry below.
      // Tracked in task task-1780402997403-waght7.
      "plugins/database/plugins/migrations/server/internal/runner.ts",
      "plugins/framework/plugins/central-core/bin/index.ts",
      "plugins/framework/plugins/cli/bin/broadcasts.ts",
      "plugins/framework/plugins/cli/bin/commands/build.ts",
      "plugins/framework/plugins/cli/bin/commands/check.ts",
      "plugins/framework/plugins/cli/bin/commands/push.ts",
      "plugins/framework/plugins/cli/bin/commands/start.ts",
      "plugins/framework/plugins/cli/bin/git/register-merge-drivers.ts",
      "plugins/framework/plugins/cli/bin/migrations.ts",
      "plugins/framework/plugins/server-core/bin/index.ts",
      "plugins/framework/plugins/tooling/plugins/checks/core/runner.ts",
      "plugins/infra/plugins/secrets/central/internal/boot.ts",
      "plugins/primitives/plugins/avatar/server/internal/gen-icon-svg-map.ts",
    ],
  },
};
