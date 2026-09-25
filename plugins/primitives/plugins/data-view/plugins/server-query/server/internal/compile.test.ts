import { describe, expect, it } from "bun:test";
import type { SQL } from "drizzle-orm";
import {
  boolean,
  integer,
  PgDialect,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  and,
  clause,
  liveBoolean,
  liveInstant,
  liveNumber,
  liveText,
  or,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  bindColumns,
  compileWhere,
  decodeFilterBody,
  filterableOf,
} from "./compile";

// Throwaway physical schema purely for SQL rendering in tests.
const t = pgTable("things", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }), // NULLABLE
  active: boolean("active").notNull(),
  score: integer("score").notNull(),
});

const dialect = new PgDialect();
const render = (s: SQL) => dialect.sqlToQuery(s);

const FILTERABLE = {
  id: liveText(),
  title: liveText(),
  status: liveText(),
  createdAt: liveInstant(),
  endedAt: liveInstant(),
  active: liveBoolean(),
  score: liveNumber(),
};

const map = bindColumns(FILTERABLE, {
  id: { col: t.id },
  title: { col: t.title },
  status: { col: t.status },
  createdAt: { col: t.createdAt },
  endedAt: { col: t.endedAt, nullable: true },
  active: { col: t.active },
  score: { col: t.score },
});

describe("bindColumns / filterableOf", () => {
  it("copies each column's domain from the declaration", () => {
    expect(map.score.domain).toBe("number");
    expect(map.endedAt).toEqual({
      col: t.endedAt,
      nullable: true,
      domain: "instant",
    });
    expect(filterableOf(map)).toEqual({
      id: { domain: "text" },
      title: { domain: "text" },
      status: { domain: "text" },
      createdAt: { domain: "instant" },
      endedAt: { domain: "instant" },
      active: { domain: "boolean" },
      score: { domain: "number" },
    });
  });
});

describe("compileWhere", () => {
  it("returns undefined for the absent filter", () => {
    expect(compileWhere(undefined, map)).toBeUndefined();
  });

  it("compiles a contains clause with an escaped, bound pattern", () => {
    const q = render(compileWhere(clause("title", "contains", "10%_x"), map)!);
    expect(q.sql).toBe(`("things"."title")::text ILIKE $1::text`);
    expect(q.params).toEqual(["%10\\%\\_x%"]);
  });

  it("relabels every text target ::text, so a uuid column takes a text op", () => {
    const q = render(compileWhere(clause("id", "eq", "abc"), map)!);
    expect(q.sql).toBe(`("things"."id")::text = $1::text`);
  });

  it("binds operands cast to the domain type, never through the column encoder", () => {
    const q = render(compileWhere(clause("score", "gt", 5), map)!);
    expect(q.sql).toBe(`"things"."score" > $1::float8`);
    expect(q.params).toEqual([5]);
  });

  it("compiles nested AND-of-OR", () => {
    const f: Filter = and(
      or(clause("status", "eq", "open"), clause("status", "eq", "closed")),
      clause("score", "gt", 5),
    );
    const q = render(compileWhere(f, map)!);
    expect(q.sql).toBe(
      `((("things"."status")::text = $1::text OR ("things"."status")::text = $2::text) AND "things"."score" > $3::float8)`,
    );
    expect(q.params).toEqual(["open", "closed", 5]);
  });

  it("a negative op keeps the NULL rows (complement semantics)", () => {
    const q = render(compileWhere(clause("endedAt", "isNotEmpty"), map)!);
    expect(q.sql).toContain("IS NOT TRUE");
  });

  it("an unknown column THROWS — nothing is dropped", () => {
    const f = clause("nope", "contains", "x") as Filter;
    expect(() => compileWhere(f, map)).toThrow(/"nope"/);
  });

  it("the search box's lowering — an OR of contains — compiles per column", () => {
    const f: Filter = or(
      clause("title", "contains", "hi"),
      clause("status", "contains", "hi"),
    );
    const q = render(compileWhere(f, map)!);
    expect(q.sql).toBe(
      `(("things"."title")::text ILIKE $1::text OR ("things"."status")::text ILIKE $2::text)`,
    );
    expect(q.params).toEqual(["%hi%", "%hi%"]);
  });
});

describe("decodeFilterBody", () => {
  const filterable = filterableOf(map);

  it("no filter in the body is the absent filter", () => {
    expect(decodeFilterBody(undefined, filterable)).toBeUndefined();
  });

  it("decodes the canonical tree the host sends", () => {
    const f = clause("title", "contains", "hi");
    expect(decodeFilterBody(f, filterable)).toEqual(f);
  });

  it("an unknown column is a 400, never a dropped rule", () => {
    let thrown: unknown;
    try {
      decodeFilterBody({ column: "nope", op: "eq", operand: "x" }, filterable);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect((thrown as HttpError).status).toBe(400);
    expect((thrown as Error).message).toContain('"nope"');
  });

  it("a wrong-domain op is a 400", () => {
    expect(() =>
      decodeFilterBody(
        { column: "score", op: "contains", operand: "1" },
        filterable,
      ),
    ).toThrow(HttpError);
  });

  it("a non-canonical spelling is a 400", () => {
    // A singleton group is not canonical — the host always sends the canonical tree.
    expect(() =>
      decodeFilterBody(
        { and: [{ column: "title", op: "contains", operand: "hi" }] },
        filterable,
      ),
    ).toThrow(HttpError);
  });
});
