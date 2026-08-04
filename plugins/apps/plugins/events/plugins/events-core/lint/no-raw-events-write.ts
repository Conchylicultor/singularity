import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** The drizzle mutation builders. A `select` on the same handle is fine. */
const WRITE_METHODS = new Set(["insert", "update", "delete"]);

/**
 * The identifiers that name the physical `events` table: the barrel's read
 * handle and the schema-glob export inside events-core. Matching by NAME keeps
 * the rule syntactic (no type information, so it is cheap and cannot mis-resolve
 * across projects); the names are distinctive enough that a collision would
 * itself be a naming bug worth flagging.
 */
const EVENTS_TABLE_IDENTIFIERS = new Set(["eventsTable", "_events"]);

function isWriteCallee(callee: TSESTree.Node): boolean {
  return (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier" &&
    WRITE_METHODS.has(callee.property.name)
  );
}

export default createRule({
  name: "no-raw-events-write",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow writing to the `events` table outside its repo funnel — " +
        "every write must stamp `updated_at` or the live revision tick stalls.",
    },
    schema: [],
    messages: {
      rawEventsWrite:
        "Do not write to `events` directly. The `events.revision` live tick is " +
        "count(*) + max(updated_at), so a write that omits the stamp lands in " +
        "the DB but never reaches an open DataView — a silent staleness bug. " +
        "Use upsertEvents() / markEventsDisappeared() from " +
        "@plugins/apps/plugins/events/plugins/events-core/server, which own the " +
        "stamp. The exported `eventsTable` handle is for READS only.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isWriteCallee(node.callee)) return;
        const [target] = node.arguments;
        if (
          target?.type === "Identifier" &&
          EVENTS_TABLE_IDENTIFIERS.has(target.name)
        ) {
          context.report({ node: target, messageId: "rawEventsWrite" });
        }
      },
    };
  },
});
