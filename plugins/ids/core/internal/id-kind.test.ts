import { describe, expect, test } from "bun:test";
import { defineIdKind, IdParseError, type AnyIdKind } from "./id-kind";
import { inlineBoundary } from "./inline-boundary";
import { detectIds } from "./detect";

// Every fixture that is an id comes from a REAL mint of the kind under test, so
// a change to a mint that its own recognition no longer accepts fails here
// rather than silently switching every chip off. The hand-typed literals below
// are the LEGACY bodies — forms no current mint produces but live rows carry.

const song = defineIdKind({ prefix: "song", label: "Song" });
const node = defineIdKind({
  prefix: "fnode",
  label: "Filter node",
  shape: "uuid",
});
const evt = defineIdKind({ prefix: "evt", label: "Event", shape: "hash" });
const att = defineIdKind({
  prefix: "att",
  label: "Attempt",
  aliases: ["claude"],
});
const legacy = defineIdKind({
  prefix: "bkmk",
  label: "Bookmark",
  legacyBareUuid: true,
});

const inline = (text: string, kind: AnyIdKind = song): string[] =>
  [...text.matchAll(inlineBoundary(kind.pattern))].map((m) => m[0]);

describe("defineIdKind — declaration", () => {
  test("rejects prefixes outside the grammar", () => {
    for (const prefix of ["", "a", "Task", "my-task", "1abc", "abcdefghijk"]) {
      expect(() => defineIdKind({ prefix, label: "x" })).toThrow();
    }
  });

  test("rejects an alias outside the grammar, or equal to its prefix", () => {
    expect(() =>
      defineIdKind({ prefix: "abc", label: "x", aliases: ["a-b"] }),
    ).toThrow();
    expect(() =>
      defineIdKind({ prefix: "abc", label: "x", aliases: ["abc"] }),
    ).toThrow();
  });

  test("pattern carries no g flag", () => {
    expect(song.pattern.flags).not.toContain("g");
  });
});

describe("stamped shape", () => {
  test("mint ↔ is ↔ pattern round-trip, suffix always 6 chars", () => {
    for (let i = 0; i < 100_000; i++) {
      const id = song.mint();
      if (!song.is(id)) throw new Error(`minted ${id} is not recognised`);
      const [, epoch, suffix] = id.split("-");
      if (suffix?.length !== 6 || epoch?.length !== 10) {
        throw new Error(`bad stamped shape: ${id}`);
      }
    }
    const id = song.mint();
    expect(inline(`see ${id} here`)).toEqual([id]);
  });

  test("legacy stamped bodies are recognised", () => {
    for (const id of [
      "song-1776202379751-fyc7xh", // ms + 6 (old task mint)
      "song-1777056314-qijt", // s + 4 (old att/conv mint)
      "song-1785758168006-jdr04d",
      "song-0002c803-f426-456d-898c-4bb7740d11be", // a rewritten bare uuid
    ]) {
      expect(song.is(id)).toBe(true);
    }
  });

  test("non-ids are refused", () => {
    for (const s of [
      "song",
      "song-",
      "song-list",
      "song-1755000000",
      "song-1755000000-ab1",
      "song-1755000000-ABCD",
      "xsong-1755000000-abcd",
      "song-1755000000-abcd/x",
    ]) {
      expect(song.is(s)).toBe(false);
    }
  });
});

describe("uuid shape", () => {
  test("mint ↔ is ↔ pattern round-trip", () => {
    for (let i = 0; i < 1000; i++) expect(node.is(node.mint())).toBe(true);
    const id = node.mint();
    expect(inline(`node ${id}.`, node)).toEqual([id]);
  });

  test("a stamped body is still recognised (recognition is generic)", () => {
    expect(node.is("fnode-1785758168006-jdr04d")).toBe(true);
  });
});

describe("hash shape", () => {
  const digest = "0123456789abcdef0123456789abcdef";

  test("mint(digest) names the digest", () => {
    expect<string>(evt.mint(digest)).toBe(`evt-${digest}`);
    expect(evt.is(evt.mint(digest))).toBe(true);
  });

  test("a non-hex or short digest throws", () => {
    expect(() => evt.mint("abc")).toThrow();
    expect(() => evt.mint("Z".repeat(32))).toThrow();
  });

  test("only hash kinds recognise a digest body", () => {
    expect(song.is(`song-${digest}`)).toBe(false);
  });
});

describe("aliases", () => {
  test("an alias is recognised with any body, and with the bare epoch", () => {
    expect(att.is("claude-1776085277-ab12")).toBe(true);
    expect(att.is("claude-1776085277")).toBe(true);
  });

  test("the bare epoch is an alias-only form", () => {
    expect(att.is("att-1776085277")).toBe(false);
  });

  test("an alias is never read inline — it cannot say which kind it is", () => {
    expect([
      ..."see claude-1776085277-ab12 now".matchAll(inlineBoundary(att.pattern)),
    ]).toEqual([]);
    expect(att.recognitionPattern.test("claude-1776085277-ab12")).toBe(true);
  });

  test("an alias is never minted", () => {
    for (let i = 0; i < 100; i++)
      expect(att.mint().startsWith("att-")).toBe(true);
  });
});

describe("parse / schema", () => {
  test("parse returns a recognised id unchanged", () => {
    const id = song.mint();
    expect(song.parse(id)).toBe(id);
  });

  test("parse throws a typed error", () => {
    expect(() => song.parse("nope")).toThrow(IdParseError);
  });

  test("legacyBareUuid upgrades a bare uuid", () => {
    const uuid = crypto.randomUUID();
    expect<string>(legacy.parse(uuid)).toBe(`bkmk-${uuid}`);
    expect<string>(legacy.schema.parse(uuid)).toBe(`bkmk-${uuid}`);
    expect(() => song.parse(uuid)).toThrow(IdParseError);
  });

  test("key upgrades a bare uuid only for a legacyBareUuid kind", () => {
    const uuid = crypto.randomUUID();
    expect<string>(legacy.key(uuid)).toBe(`bkmk-${uuid}`);
    expect<string>(legacy.key(`bkmk-${uuid}`)).toBe(`bkmk-${uuid}`);
    expect<string>(legacy.key("anything-else")).toBe("anything-else");
    expect<string>(song.key(uuid)).toBe(uuid);
  });

  test("schema accepts ids and refuses the rest", () => {
    const id = song.mint();
    expect(song.schema.parse(id)).toBe(id);
    expect(song.schema.safeParse("song-list").success).toBe(false);
  });
});

describe("inline boundary", () => {
  test("paths, URLs and dotted suffixes are not mentions", () => {
    const id = song.mint();
    expect(inline(`${id}/logs`)).toEqual([]);
    expect(inline(`${id}.ts`)).toEqual([]);
    expect(inline(`/${id}`)).toEqual([]);
    expect(inline(`https://x.dev/${id}`)).toEqual([]);
  });

  test("an id ending a sentence still matches", () => {
    const id = song.mint();
    expect(inline(`filed as ${id}.`)).toEqual([id]);
  });

  test("a variable-length suffix cannot backtrack into a longer word", () => {
    expect(inline(`${song.mint()}abc`)).toEqual([]);
  });

  test("every id in a paragraph is found, in order", () => {
    const a = song.mint();
    const b = song.mint();
    expect(inline(`${a} blocks ${b}`)).toEqual([a, b]);
  });
});

describe("detectIds", () => {
  test("finds every kind, in reading order", () => {
    const a = song.mint();
    const b = node.mint();
    const hits = detectIds(`first ${b} then ${a}.`, [song, node]);
    expect(hits.map((h) => [h.kind.prefix, h.id])).toEqual([
      ["fnode", b],
      ["song", a],
    ]);
    expect(hits[0]!.start).toBe(6);
  });

  test("a shared alias is detected as neither kind", () => {
    const conv = defineIdKind({
      prefix: "conv",
      label: "Conversation",
      aliases: ["claude"],
    });
    const id = conv.mint();
    const hits = detectIds(`see claude-1776085277 and ${id} now`, [att, conv]);
    expect(hits.map((h) => [h.kind.prefix, h.id])).toEqual([["conv", id]]);
  });
});

describe("stampedAtMs", () => {
  test("a fresh mint reads back as now (seconds precision)", () => {
    const before = Math.floor(Date.now() / 1000) * 1000;
    const at = song.stampedAtMs(song.mint());
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  test("legacy millis and current seconds order against each other", () => {
    const legacy = song.stampedAtMs("song-1791400000123-ab12cd");
    const current = song.stampedAtMs("song-1791400005-ab12cd");
    expect(legacy).toBe(1791400000123);
    expect(current).toBe(1791400005000);
    expect(current! > legacy!).toBe(true);
  });

  test("no stamp: a uuid body, another kind, or not an id", () => {
    expect(node.stampedAtMs(node.mint())).toBeUndefined();
    expect(song.stampedAtMs("task-1791400005-ab12cd")).toBeUndefined();
    expect(song.stampedAtMs("song-nope")).toBeUndefined();
  });
});
