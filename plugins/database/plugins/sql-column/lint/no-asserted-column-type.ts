/**
 * no-asserted-column-type
 *
 * `text("status").$type<"a" | "b">()` declares a type nothing produces. Unlike
 * `.mapWith`, `$type` changes **no runtime behaviour at all** — it is purely a
 * type assertion — so a row holding anything else is handed to typed code as if
 * it matched, and every downstream `switch` falls through. It is the
 * `pool.query<Row>(sql)` hole (`sql-rows`) and the ``sql<T>`…` `` hole
 * (`sql-projection`) one layer lower: on the column itself.
 *
 * It is not hypothetical here. Two of this repo's five sites already carry a
 * `tolerantEnum(...)` hedge at the live-state resource boundary — created, per
 * its own doc comment, because "a single stale row would otherwise throw a
 * `ZodError` on the WS push path and blank the entire list". That guard sits on
 * the WIRE, so it protected the browser and nothing else: two server-side
 * readers went straight to the raw column and would have thrown a `TypeError`
 * on a registry lookup for a legacy value the guard exists to absorb.
 *
 * There are two spellings that let you narrow a text column's type WITHOUT a
 * decoder, and both are banned:
 *
 *   text("x").$type<T>()          the assertion
 *   text("x", { enum: [...] })    the type derived from a runtime list
 *
 * The second is better — the type comes from real data rather than from an
 * unrelated type, so it cannot drift — but drizzle emits no CHECK constraint for
 * it, so the stored value is still unverified. Both of its call sites had also
 * duplicated a literal list their own `shared/schemas.ts` already held, so the
 * migration left one `z.enum` feeding the column and the wire schema alike.
 *
 * The sanctioned door is `parsedText(name, schema)` from
 * `@plugins/database/plugins/sql-column/server`, whose `T` is inferred from the
 * schema argument and from nowhere else. It emits byte-identical DDL (drizzle-kit
 * reads `getSQLType()`, which is `"text"`), so adopting it generates no
 * migration.
 *
 * Scoped by the chain's ROOT: it fires only when the `$type` / config sits on a
 * literal `text(` / `varchar(` / `char(` call. That is what keeps two things out
 * of scope on purpose — `jsonb(…).$type<T>()` (a weaker tier: pg really decodes
 * JSON, so only the shape is asserted) and `defineEntity`'s generic `b.$type()`
 * (whose type comes from a field's own `FieldDef`, and whose fix belongs in the
 * `fields.storage` capability).
 *
 * NOT type-aware, matching the closest precedents (`no-asserted-sql-type`,
 * `no-unparsed-sql-rows`, `no-narrow-zodtype`) — and self-contained by necessity:
 * a contributed rule file is loaded by jiti, which cannot resolve the
 * `@plugins/*` alias, so the rule can name no type from the repo.
 *
 * See research/2026-08-25-database-decoded-columns.md.
 */
import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * The plugin that owns the sanctioned decoder. Its docs and tests have to be
 * able to write the banned form in order to name it. Skipped whole.
 */
const SQL_COLUMN_DIR = "plugins/database/plugins/sql-column/";

/** The drizzle pg-core builders that produce a `text`-family column. */
const TEXT_COLUMN_FACTORIES = new Set(["text", "varchar", "char"]);

/**
 * ``text("x")`` — a bare call to one of the text-family builders. Deliberately
 * NOT a type predicate: narrowing `node` on the false branch would leave the
 * `$type` check reading `.callee` off `never`.
 */
function isTextColumnCall(node: TSESTree.Node): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    TEXT_COLUMN_FACTORIES.has(node.callee.name)
  );
}

/**
 * Is `expr` a text-column builder, possibly behind a chain of calls on it —
 * `text("x").notNull()`, `text("x").default("a")`? Only such a chain can carry
 * drizzle's `$type`, so this keeps the rule off every unrelated `.$type<T>()`
 * (notably `jsonb(…)`, which is deliberately out of scope).
 */
function rootsInTextColumn(expr: TSESTree.Node): boolean {
  if (isTextColumnCall(expr)) return true;
  if (expr.type === "TSNonNullExpression" || expr.type === "TSAsExpression") {
    return rootsInTextColumn(expr.expression);
  }
  if (expr.type === "CallExpression") return rootsInTextColumn(expr.callee);
  if (expr.type === "MemberExpression") return rootsInTextColumn(expr.object);
  return false;
}

/**
 * Explicit type arguments. typescript-eslint renamed `typeParameters` →
 * `typeArguments` on call expressions; the repo is on v8 but the rule stays
 * readable under both.
 */
function hasTypeArguments(node: TSESTree.CallExpression): boolean {
  const withBoth = node as unknown as {
    typeArguments?: unknown;
    typeParameters?: unknown;
  };
  return (
    withBoth.typeArguments !== undefined ||
    withBoth.typeParameters !== undefined
  );
}

/** The static name of a member property: `a.$type` and `a["$type"]` both → "$type". */
function propertyName(node: TSESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return null;
}

/** `{ enum: [...] }` as the builder's config argument. */
function hasEnumConfig(node: TSESTree.CallExpression): boolean {
  return node.arguments.some(
    (arg) =>
      arg.type === "ObjectExpression" &&
      arg.properties.some(
        (prop) =>
          prop.type === "Property" &&
          !prop.computed &&
          ((prop.key.type === "Identifier" && prop.key.name === "enum") ||
            (prop.key.type === "Literal" && prop.key.value === "enum")),
      ),
  );
}

const REMEDY =
  "Use `parsedText(name, schema)` from `@plugins/database/plugins/sql-column/server`: it builds the " +
  "same `text` column through drizzle's `customType`, with the schema as the real `fromDriver` / " +
  "`toDriver` decoder, and infers the column's type from that schema alone — so the type cannot be " +
  "chosen independently of what runs. Pass the strict `z.enum` when the value set is closed and " +
  "private to one engine (an outsider is a bug, so it throws), or a `tolerantEnum(strict, normalize, " +
  "report)` when ids get renamed and old rows outlive them (it normalizes and fires the deduped " +
  "corruption report instead). The generated DDL is byte-identical to `text(...)` — `getSQLType()` is " +
  '"text" — so adopting it produces no migration. ' +
  "See research/2026-08-25-database-decoded-columns.md.";

export default createRule({
  name: "no-asserted-column-type",
  meta: {
    type: "problem",
    docs: {
      description:
        "a text column's narrowed type must come from a decoder — `parsedText(name, schema)`, never `$type<T>()` or an `enum` config",
    },
    schema: [],
    messages: {
      assertedColumnType:
        "This `.$type<…>()` on a text column declares a type nothing produces. `$type` changes NO runtime " +
        "behaviour at all — it is purely a type assertion, unlike `.mapWith`, which is why the projection " +
        "guardrail does not reach here. A row written by an older schema version, by hand, or by a worktree " +
        "on different code reads back as a well-typed value that is not in the union, and every downstream " +
        "`switch` falls through. It has already cost this repo two `tolerantEnum` hedges at the live-state " +
        "resource boundary — which protected the browser and left two server-side readers throwing a " +
        "`TypeError` on a registry lookup. " +
        REMEDY,
      enumColumnConfig:
        "This `{ enum: [...] }` config derives the column's type from a runtime list, which is better than " +
        "`$type<T>()` — the type cannot drift from an unrelated type — but drizzle emits no CHECK constraint " +
        "for it, so the stored value is still unverified and a row outside the list still reads back as a " +
        "well-typed member. " +
        "It is also where the same literal list tends to get duplicated: both of this repo's call sites " +
        "spelled the set twice, once here and once in the plugin's own `shared/schemas.ts` wire schema, free " +
        "to drift apart. One `z.enum` feeding both is the fix in either direction. " +
        REMEDY,
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename.split("\\").join("/");
    // sql-column owns the sanctioned decoder — its docs and tests must be able
    // to write the banned form in order to name it.
    if (filename.includes(SQL_COLUMN_DIR)) return {};

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (isTextColumnCall(node)) {
          if (hasEnumConfig(node)) {
            context.report({ node, messageId: "enumColumnConfig" });
          }
          return;
        }
        if (!hasTypeArguments(node)) return;
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (propertyName(callee) !== "$type") return;
        if (!rootsInTextColumn(callee.object)) return;
        context.report({ node, messageId: "assertedColumnType" });
      },
    };
  },
});
