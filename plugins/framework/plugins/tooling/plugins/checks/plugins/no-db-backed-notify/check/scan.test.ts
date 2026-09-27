import { describe, expect, test } from "bun:test";
import { ALLOWED_PATHS, scanDbBackedNotify } from "./scan";

const scan = (
  src: string,
  rel = "plugins/debug/plugins/sentinel/server/internal/status-resource.ts",
) => scanDbBackedNotify([{ rel, src }]);

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

describe("scanDbBackedNotify — allowlist", () => {
  // jobs-list reads graphile_worker.*, which the change feed excludes, so it is
  // external on purpose — under either spelling.
  const allowed = ALLOWED_PATHS[0]!;

  test("exempts an allowlisted file under both spellings", () => {
    const src = [
      "export const jobsListResource = defineExternalResource({",
      '  key: "jobs-list",',
      "  loader: async () => db.execute(sql`SELECT 1 FROM graphile_worker.jobs`),",
      "});",
      "export const jobsListServed = serveValue(jobsList, {",
      '  source: "external",',
      "  loader: async () => db.execute(sql`SELECT 1 FROM graphile_worker.jobs`),",
      "});",
    ].join("\n");
    expect(scan(src, allowed)).toEqual([]);
    // The same source anywhere else is flagged twice.
    expect(scan(src)).toHaveLength(2);
  });
});
