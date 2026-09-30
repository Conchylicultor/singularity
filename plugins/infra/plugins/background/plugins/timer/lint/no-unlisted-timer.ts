import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Every `defineTimer(...)` call is reported unless its file is listed — with
 * its reason — in this plugin's `ignores`. A timer is a periodic in-process
 * loop, which CLAUDE.md's "no polling" rule forbids by default: work on a
 * schedule is a `defineJob`, work on a change is a watcher / LISTEN / event.
 * The allowlist is where each exception (central has no job queue; a watchdog
 * or sampler that must keep running while the queue is wedged) is argued once.
 */
export default createRule({
  name: "no-unlisted-timer",
  meta: {
    type: "problem",
    docs: {
      description:
        "`defineTimer` is allowed only in the files the timer plugin's lint " +
        "`ignores` lists, each with its reason — so a timer cannot become a " +
        "polling escape hatch.",
    },
    schema: [],
    messages: {
      unlistedTimer:
        "`defineTimer` is not a polling escape hatch. Work on a schedule is a " +
        "`defineJob` (cron); work on a change is a watcher / LISTEN / event. If " +
        "this loop truly must run in-process (central has no job queue; a " +
        "watchdog or sampler that must run while the queue is wedged), add this " +
        "file to `no-unlisted-timer`'s ignores in " +
        "plugins/infra/plugins/background/plugins/timer/lint/index.ts, with the reason.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;
        const name =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" &&
                callee.property.type === "Identifier"
              ? callee.property.name
              : undefined;
        if (name === "defineTimer") {
          context.report({ node, messageId: "unlistedTimer" });
        }
      },
    };
  },
});
