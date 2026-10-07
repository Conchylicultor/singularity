import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findFeedExclusions, pluginRootOf, scanDbBackedNotify } from "./scan";

const scan = (
  src: string,
  rel = "plugins/debug/plugins/sentinel/server/internal/status-resource.ts",
) => scanDbBackedNotify([{ rel, src }], new Map());

describe("scanDbBackedNotify — defineExternalResource", () => {
  test("flags a call whose loader reads db.", () => {
    const src = [
      'import { db } from "@plugins/database/server";',
      "export const res = defineExternalResource({",
      '  key: "k",',
      '  mode: "push",',
      "  loader: async () => db.select().from(_t),",
      "});",
    ].join("\n");
    expect(scan(src)).toEqual([
      {
        path: "plugins/debug/plugins/sentinel/server/internal/status-resource.ts",
        line: 2,
        marker: "defineExternalResource",
      },
    ]);
  });

  test("flags the generic form spanning lines", () => {
    const src = [
      "export const res = defineExternalResource<",
      "  Payload,",
      "  { id: string }",
      ">({",
      '  key: "k",',
      "  loader: async ({ id }) => db.query.things.findFirst({ where: eq(t.id, id) }),",
      "});",
    ].join("\n");
    expect(scan(src).map((o) => o.line)).toEqual([1]);
  });

  test("passes a loader with no db. read, and ignores db. outside the call", () => {
    const src = [
      "const rows = await db.select().from(_t);",
      "export const res = defineExternalResource({",
      '  key: "k",',
      "  // db.select() here is only a comment",
      '  loader: () => readGitState("db.select"),',
      "});",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });
});

describe("scanDbBackedNotify — serveValue", () => {
  test("flags an external loader that reads db.", () => {
    const src = [
      'import { serveValue } from "@plugins/network/plugins/live/server";',
      "",
      "export const served = serveValue(things, {",
      '  source: "external",',
      "  loader: async () => {",
      "    const rows = await db.select().from(_things);",
      "    return rows;",
      "  },",
      "});",
    ].join("\n");
    expect(scan(src)).toEqual([
      {
        path: "plugins/debug/plugins/sentinel/server/internal/status-resource.ts",
        line: 3,
        marker: "serveValue",
      },
    ]);
  });

  test("flags a db. read in any external option, not only the loader", () => {
    const src = [
      "export const served = serveValue(things, {",
      '  source: "external",',
      "  loader: () => readState(),",
      "  revalidate: async () => (await db.execute(sql`SELECT 1`)).rows[0],",
      "});",
    ].join("\n");
    expect(scan(src).map((o) => o.marker)).toEqual(["serveValue"]);
  });

  test("passes the db arm reading db.", () => {
    const src = [
      "export const served = serveValue(things, {",
      '  source: "db",',
      "  loader: async () => db.select().from(_things),",
      "});",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("passes an external loader that reads no db.", () => {
    const src = [
      "export const served = serveValue(refHead, {",
      '  source: "external",',
      "  loader: async () => readRefHead(),",
      "});",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("reads only the options object's own source, never one inside the loader", () => {
    const src = [
      "export const served = serveValue(things, {",
      '  source: "db",',
      "  loader: async () => {",
      '    const meta = { source: "external" };',
      "    return { meta, rows: await db.select().from(_things) };",
      "  },",
      "});",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("ignores serveValue's own declaration and a serveValue in a string", () => {
    const src = [
      "export function serveValue<T, P extends Record<string, string>>(",
      "  value: LiveValue<T, P>,",
      "  opts: ServeValueOptions<T, P>,",
      "): ServedValue<T, P> {",
      "  return register(db.schema, value, opts);",
      "}",
      'const doc = "serveValue(v, { source: \\"external\\", loader: () => db.select() })";',
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  test("reports each spelling in a file that has both", () => {
    const src = [
      "export const a = defineExternalResource({",
      '  key: "a",',
      "  loader: () => db.select().from(_a),",
      "});",
      "export const b = serveValue(bValue, {",
      '  source: "external",',
      "  loader: () => db.select().from(_b),",
      "});",
    ].join("\n");
    expect(scan(src).map((o) => [o.line, o.marker])).toEqual([
      [1, "defineExternalResource"],
      [5, "serveValue"],
    ]);
  });
});

describe("scanDbBackedNotify — sql-rows readers", () => {
  test("flags executeRows(db, …) / queryRows(db, …) in an external call", () => {
    const src = [
      "export const served = serveValue(things, {",
      '  source: "external",',
      "  loader: () => executeRows(db, sql`SELECT 1`, Row),",
      "});",
      "export const other = serveValue(more, {",
      '  source: "external",',
      "  loader: () => queryRows( db, Row),",
      "});",
    ].join("\n");
    expect(scan(src).map((o) => o.line)).toEqual([1, 5]);
  });
});

describe("scanDbBackedNotify — derived feed-exclusion exemption", () => {
  const external = (table: string) =>
    [
      "export const served = serveValue(summary, {",
      '  source: "external",',
      `  loader: ({ window }) => db.select().from(${table}),`,
      "});",
    ].join("\n");
  const exclusion = [
    'import { ExcludeFromChangeFeed } from "@plugins/database/plugins/change-feed/server";',
    "export const contributions = [",
    '  ExcludeFromChangeFeed({ table: _ledgerMinute, reason: "written every minute" }),',
    "];",
  ].join("\n");
  // Real plugin paths (plugin-refs-resolve checks every path literal): the
  // ledger, its parent and a sibling.
  const ledger = "plugins/debug/plugins/latency-ledger";
  const parent = "plugins/debug";
  const sibling = "plugins/debug/plugins/slow-ops";
  const ledgerExclusions = () =>
    findFeedExclusions([
      { rel: `${ledger}/server/internal/contributions.ts`, src: exclusion },
    ]);

  test("pluginRootOf names the deepest plugin a file sits in", () => {
    expect(pluginRootOf(`${ledger}/server/internal/summary.ts`)).toBe(ledger);
    expect(pluginRootOf("plugins/tasks/server/index.ts")).toBe("plugins/tasks");
    expect(pluginRootOf("cli/index.ts")).toBeNull();
  });

  test("findFeedExclusions collects each call's table identifier per plugin", () => {
    expect([...ledgerExclusions()]).toEqual([
      [ledger, new Set(["_ledgerMinute"])],
    ]);
  });

  test("a call over the plugin's excluded table is exempt; its sibling is not", () => {
    const exclusions = ledgerExclusions();
    const scanAt = (rel: string) =>
      scanDbBackedNotify([{ rel, src: external("_ledgerMinute") }], exclusions);
    expect(scanAt(`${ledger}/server/internal/summary.ts`)).toEqual([]);
    expect(scanAt(`${sibling}/server/summary.ts`)).toHaveLength(1);
    expect(scanAt(`${parent}/server/summary.ts`)).toHaveLength(1);
  });

  test("the same plugin serving external over a feed-visible table is flagged", () => {
    const exclusions = ledgerExclusions();
    const rel = `${ledger}/server/internal/status.ts`;
    expect(
      scanDbBackedNotify([{ rel, src: external("_ledgerState") }], exclusions),
    ).toHaveLength(1);
    // A whole-word match only: a longer name sharing the prefix is not it.
    expect(
      scanDbBackedNotify(
        [{ rel, src: external("_ledgerMinuteState") }],
        exclusions,
      ),
    ).toHaveLength(1);
  });

  test("an exclusion exempts its own plugin only, never a child plugin", () => {
    const exclusions = findFeedExclusions([
      { rel: `${parent}/server/index.ts`, src: exclusion },
    ]);
    expect([...exclusions.keys()]).toEqual([parent]);
    expect(
      scanDbBackedNotify(
        [
          {
            rel: `${ledger}/server/internal/summary.ts`,
            src: external("_ledgerMinute"),
          },
        ],
        exclusions,
      ),
    ).toHaveLength(1);
  });

  test("a table that is not a plain identifier names nothing", () => {
    const exclusions = findFeedExclusions([
      {
        rel: `${ledger}/server/internal/contributions.ts`,
        src: [
          "tables.flatMap((table) => [ExcludeFromChangeFeed({ table, reason: r })]);",
          "ExcludeFromChangeFeed({ table: schema.minute, reason: r });",
          "ExcludeFromChangeFeed({ table: pick(), reason: r });",
        ].join("\n"),
      },
    ]);
    expect(exclusions.size).toBe(0);
  });

  test("an exclusion in a comment, a string or test code exempts nothing", () => {
    const exclusions = findFeedExclusions([
      {
        rel: `${ledger}/server/internal/a.ts`,
        src: '// ExcludeFromChangeFeed({ table: _x })\nconst s = "ExcludeFromChangeFeed({ table: _x })";',
      },
      { rel: `${ledger}/server/internal/a.test.ts`, src: exclusion },
      { rel: `${ledger}/server/testing/index.ts`, src: exclusion },
    ]);
    expect(exclusions.size).toBe(0);
  });

  test("the exclusion's own definition (not a call) exempts nothing", () => {
    const exclusions = findFeedExclusions([
      {
        rel: "plugins/database/plugins/change-feed/server/internal/exclusion.ts",
        src: 'export const ExcludeFromChangeFeed = defineServerContribution<{ table: PgTable }>("x");',
      },
    ]);
    expect(exclusions.size).toBe(0);
  });

  // Pins the link the exemption was built for: the latency ledger's real
  // declarations name every one of its four tables, so its summary value may
  // read them while served external.
  test("the latency ledger's real contributions exclude its four tables", () => {
    const repoRoot = resolve(import.meta.dir, "../../../../../../../../..");
    const rel = `${ledger}/server/internal/contributions.ts`;
    const exclusions = findFeedExclusions([
      { rel, src: readFileSync(resolve(repoRoot, rel), "utf8") },
    ]);
    expect(exclusions.get(ledger)).toEqual(
      new Set([
        "_latencyLedgerMinute",
        "_latencyLedgerHostMinute",
        "_latencyLedgerThreadMinute",
        "_latencyLedgerInteraction",
      ]),
    );
  });
});
