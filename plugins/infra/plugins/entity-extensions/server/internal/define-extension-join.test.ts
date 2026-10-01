import { describe, expect, test } from "bun:test";
import { is, SQL } from "drizzle-orm";
import { PgDialect, pgTable, text } from "drizzle-orm/pg-core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { compileJoins } from "@plugins/infra/plugins/query-resource/server";
import { defineExtension } from "./define-extension";

// `ext.join(alias)`: an extension handle as a join of its parent's collection
// (research/2026-09-29-global-scoped-change-routing.md, P2). Kept apart from
// `define-extension.test.ts`, which swaps the database module for a recording
// proxy: nothing here touches a database.

const parent = pgTable("ext_join_probe", { id: text("id").primaryKey() });
const shape = defineExtensionShape({
  key: "songId",
  fields: { plays: intField(), lastPlayedAt: dateField() },
});
const playback = defineExtension(parent, "playback", shape, {
  columns: { plays: { default: 0 } },
});

describe("defineExtension join", () => {
  test("the handle joins its parent's collection as data: LEFT, 1:1 on the parent's id", () => {
    const spec = playback.join("playback");
    expect(spec.kind).toBe("extension");
    expect(spec.alias).toBe("playback");
    expect(spec.table).toBe(playback.table);
    expect(spec.key).toBe(playback.table.songId);
    expect(spec.parentKey).toBe(parent.id);
  });

  test("it offers only the wire columns: the server-only timestamps are not bindable", () => {
    const spec = playback.join("playback");
    expect(Object.keys(spec.wireColumns).sort()).toEqual([
      "lastPlayedAt",
      "plays",
      "songId",
    ]);
    expect(spec.wireColumns).toBe(playback.wireColumns);
  });

  test("the query compiler accepts it (A4) and renders it on its alias", () => {
    const plan = compileJoins(
      { table: parent, name: "ext_join_probe" },
      [playback.join("playback")],
      parent.id,
      "test",
    );
    const plays = plan.render({ from: "playback", col: playback.table.plays });
    expect(plan.relationOf(plays)).toBe("playback");
    expect(plan.joins[0]!.inner).toBe(false);
  });
});

describe("defineExtension join — a missing side row reads its defaults", () => {
  const plan = () =>
    compileJoins(
      { table: parent, name: "ext_join_probe" },
      [playback.join("playback")],
      parent.id,
      "test",
    );
  const dialect = new PgDialect();

  test("a column with a literal default renders COALESCE(alias.col, default): never NULL, in a filter, sort or projection", () => {
    const p = plan();
    const plays = p.render({ from: "playback", col: playback.table.plays });
    expect(is(plays, SQL)).toBe(true);
    const q = dialect.sqlToQuery(plays as SQL);
    expect(q.sql).toBe(`COALESCE("playback"."plays", $1)`);
    expect(q.params).toEqual([0]);
    // Its provenance is still the join, and it is non-nullable (keyset keys and
    // the LEFT-join nullable-field rule read this).
    expect(p.relationOf(plays)).toBe("playback");
    expect(p.columnOf(plays).name).toBe("plays");
    expect(p.canBeNull(plays)).toBe(false);
    // One expression per (relation, column): identity is stable across renders.
    expect(p.render({ from: "playback", col: playback.table.plays })).toBe(
      plays,
    );
  });

  test("an undefaulted column stays the raw alias column, and nullable through the LEFT join", () => {
    const p = plan();
    const last = p.render({
      from: "playback",
      col: playback.table.lastPlayedAt,
    });
    expect(is(last, SQL)).toBe(false);
    expect(p.canBeNull(last)).toBe(true);
  });

  test("the join condition compares the stored key, never a default", () => {
    const [join] = plan().joins;
    expect(dialect.sqlToQuery(join!.on).sql).toBe(
      `"playback"."parent_id" = "ext_join_probe"."id"`,
    );
  });
});
