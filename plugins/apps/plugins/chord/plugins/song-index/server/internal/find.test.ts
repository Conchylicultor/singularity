import { describe, expect, it } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { chordTokenFromParts, compactChord, deriveSection } from "../../core";
import {
  FindLoopsBodySchema,
  NextChordsBodySchema,
} from "../../core/endpoints";
import { chord, section, windowsOf } from "../../core/test-sections";
import {
  chordsInWindow,
  findLoopsWhere,
  nextChordsQuery,
  playableVideoWhere,
} from "./find";

const dialect = new PgDialect();
const I = "0:4-3/0";
const IV = "5:4-3/0";
const V = "7:4-3/0";

describe("findLoopsWhere", () => {
  it("binds the target and the unlocked set as whole arrays", () => {
    const body = FindLoopsBodySchema.parse({
      unlocked: [I, IV, V],
      target: IV,
      limit: 10,
    });
    const { sql, params } = dialect.sqlToQuery(findLoopsWhere(body));
    expect(sql).toContain(`"chord_loop_windows"."shape" = $1`);
    expect(sql).toContain(`"chord_loop_windows"."chord_tokens" @> $2`);
    expect(sql).toContain(`"chord_loop_windows"."chord_tokens" <@ $3`);
    // The column's array encoder sends each array as one Postgres array literal.
    expect(params).toEqual(["bars-4", `{"${IV}"}`, `{"${I}","${IV}","${V}"}`]);
  });

  it("adds the optional filters only when given", () => {
    const body = FindLoopsBodySchema.parse({
      unlocked: [I, IV],
      target: I,
      modes: ["major", "mixolydian"],
      requireFeatures: ["seventh"],
      forbidFeatures: ["borrowed", "applied"],
      excludeSectionIds: ["qveoYyGGodn"],
      limit: 5,
    });
    const { sql, params } = dialect.sqlToQuery(findLoopsWhere(body));
    expect(sql).toContain(`"chord_loop_windows"."key_mode" in ($4, $5)`);
    expect(sql).toContain(`"chord_loop_windows"."features" @> $6`);
    expect(sql).toContain(`not "chord_loop_windows"."features" && $7`);
    expect(sql).toContain(`"chord_loop_windows"."section_id" not in ($8)`);
    expect(params.slice(3)).toEqual([
      "major",
      "mixolydian",
      '{"seventh"}',
      '{"borrowed","applied"}',
      "qveoYyGGodn",
    ]);
  });

  it("refuses a target outside the unlocked set", () => {
    const result = FindLoopsBodySchema.safeParse({
      unlocked: [I, V],
      target: IV,
      limit: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["target"]);
  });
});

describe("playableVideoWhere", () => {
  it("keeps a video with no status row, and leaves out the unplayable ones", () => {
    // Fail open: a left-joined video nobody has checked has a NULL status and
    // must stay offered. Only the statuses that cannot play are excluded.
    const { sql, params } = dialect.sqlToQuery(playableVideoWhere());
    expect(sql).toMatch(/is null or .* not in \(\$1, \$2\)/);
    expect(params).toEqual(["gone", "not-embeddable"]);
  });

  it("is not part of the windows-only WHERE", () => {
    // `findLoopsWhere` is the set `nextChordsQuery` counts, which deliberately
    // ignores the videos; it must stand on the windows table alone.
    const body = FindLoopsBodySchema.parse({
      unlocked: [I, IV],
      target: I,
      limit: 10,
    });
    const { sql } = dialect.sqlToQuery(findLoopsWhere(body));
    expect(sql).not.toContain("status");
  });
});

describe("nextChordsQuery", () => {
  it("binds the unlocked set as one text[] parameter", () => {
    const body = NextChordsBodySchema.parse({ unlocked: [I, IV, V] });
    const { sql, params } = dialect.sqlToQuery(nextChordsQuery(body));
    expect(sql).toContain("NOT (t = ANY($1::text[]))");
    expect(sql).toContain("cardinality(foreign_tokens) = 1");
    expect(params).toEqual([[I, IV, V], "bars-4", 20]);
  });

  it("groups by token AND mode in one scan, ranked by the largest mode", () => {
    // One pass over the windows answers every mode: the modes are grouped
    // alongside the token, then folded into one row per token. `limit` counts
    // tokens, so it is applied after the fold, and the ranking is the biggest
    // single mode — a chord that is huge in minor must not sink under the sum.
    const body = NextChordsBodySchema.parse({ unlocked: [I] });
    const { sql } = dialect.sqlToQuery(nextChordsQuery(body));
    expect(sql).toContain("GROUP BY 1, 2");
    expect(sql).toContain('jsonb_object_agg(key_mode, windows) AS "byMode"');
    expect(sql).toContain("ORDER BY max(windows) DESC, token");
    expect(sql.lastIndexOf("LIMIT")).toBeGreaterThan(
      sql.indexOf("GROUP BY token"),
    );
  });

  it("reads every window of the shape, sharing a chord with the set or not", () => {
    // The count's contract: a window whose chords are ALL outside the set still
    // has one distinct chord outside it when it is a vamp, and unlocking that
    // chord makes `find` return it. An `&&` prefilter would drop exactly those.
    // `find-db.test.ts` runs the query over such a window on a real database.
    const body = NextChordsBodySchema.parse({ unlocked: [I, IV, V] });
    const { sql } = dialect.sqlToQuery(nextChordsQuery(body));
    expect(sql).not.toContain('chord_tokens" &&');
  });

  it("filters modes when given", () => {
    const body = NextChordsBodySchema.parse({
      unlocked: [I],
      modes: ["minor"],
      limit: 5,
    });
    const { sql, params } = dialect.sqlToQuery(nextChordsQuery(body));
    expect(sql).toContain(`"chord_loop_windows"."key_mode" in ($3)`);
    expect(params).toEqual([[I], "bars-4", "minor", 5]);
  });
});

describe("chordsInWindow", () => {
  // A section where one chord ends a hair past a bar line: 8 bars of 4/4, one
  // chord per bar, the first a ii that rings 1e-9 beats into bar 2. Comparing
  // beats without a tolerance (`beat + duration > startBeat`) keeps it in the
  // window starting at bar 2 — the window whose derivation, which does use the
  // tolerance, never counted it.
  const DRIFT = 1e-9;
  const roots = [2, 4, 5, 1, 4, 5, 1, 1];
  const chords = roots.map((root, i) =>
    chord(1 + i * 4, i === 0 ? 4 + DRIFT : 4, { root }),
  );
  const derived = deriveSection(section(chords, { endBeat: 33 }));
  if (derived.kind !== "indexed") throw new Error("the fixture must index");
  const stored = derived.chords.map(compactChord);
  const windows = windowsOf(derived);

  it("returns exactly the chords the window was derived from", () => {
    expect(windows.length).toBeGreaterThan(1);
    for (const window of windows) {
      const chords = chordsInWindow(stored, window);
      expect(chords.map((c) => c.token).filter((t) => t !== null)).toHaveLength(
        window.chordCount,
      );
      for (const { token } of chords) {
        if (token !== null) expect(window.chordTokens).toContain(token);
      }
    }
  });

  it("leaves out a chord that only drifts past the window's first beat", () => {
    const secondBar = windows.find((w) => w.startBeat === 5);
    if (secondBar === undefined) throw new Error("no window at beat 5");
    const ii = chordTokenFromParts({
      root: 2,
      intervals: [3, 4],
      inversion: 0,
    });
    expect(secondBar.chordTokens).not.toContain(ii);
    expect(chordsInWindow(stored, secondBar).map((c) => c.beat)).not.toContain(
      1,
    );
  });
});
