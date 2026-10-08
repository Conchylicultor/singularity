/**
 * A28: the one scanner reading of what a call mints (`mintsOf`) against what
 * the factory really mints at runtime — every `liveCollection` form, so a new
 * form (or a new mint) that the vocabulary does not describe fails here, not
 * as a resource missing from the docs or an eager pin that never lands.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { liveCollection } from "@plugins/network/plugins/live/core";
import { resourceDescriptorByKey } from "@plugins/primitives/plugins/live-state/core";
import { mintsOf } from "./mints";
import { resourceDescriptorFactories } from "./vocabulary";

const Row = z.object({ id: z.string(), kind: z.string(), n: z.number() });
const WHERE = { file: "x.ts", line: 1 };

/** The keys a collection minted, with whether each is keyed, read off the runtime registry. */
function runtimeMints(c: { key: string }): { key: string; keyed: boolean }[] {
  return ["", ":rows", ":groups"]
    .map((suffix) => c.key + suffix)
    .flatMap((key) => {
      const d = resourceDescriptorByKey(key);
      return d === undefined ? [] : [{ key, keyed: d.keyed !== undefined }];
    });
}

function scannedMints(
  key: string,
  specText: string,
): { key: string; keyed: boolean }[] {
  return mintsOf(
    resourceDescriptorFactories.liveCollection,
    `"${key}", ${specText}`,
    WHERE,
  ).map((m) => ({ key: key + m.suffix, keyed: m.keyed }));
}

describe("mintsOf ≡ liveCollection's runtime mints (A28)", () => {
  test("a window collection: key, :rows, :groups", () => {
    const c = liveCollection("test.mints.window", {
      row: Row,
      id: "id",
      filterable: {},
      sortable: ["n"],
      default: { orderBy: [["n", "asc"]], limit: 10 },
      maxLimit: 10,
    });
    expect(
      scannedMints(
        "test.mints.window",
        `{ row: Row, id: "id", filterable: {}, sortable: ["n"], default: { orderBy: [["n", "asc"]], limit: 10 }, maxLimit: 10 }`,
      ),
    ).toEqual(runtimeMints(c));
  });

  test("a lookup-only collection: :rows alone", () => {
    const c = liveCollection("test.mints.lookup", { row: Row, id: "id" });
    expect(scannedMints("test.mints.lookup", `{ row: Row, id: "id" }`)).toEqual(
      runtimeMints(c),
    );
  });

  test("an `all` collection: the whole set and :rows, no :groups", () => {
    const c = liveCollection("test.mints.all", {
      row: Row,
      id: "id",
      all: { orderBy: [["n", "asc"]], unbounded: { reason: "a test set" } },
    });
    const scanned = scannedMints(
      "test.mints.all",
      `{ row: Row, id: "id", all: { orderBy: [["n", "asc"]], unbounded: { reason: "a test set" } } }`,
    );
    expect(scanned).toEqual(runtimeMints(c));
    expect(scanned.map((m) => m.key)).toEqual([
      "test.mints.all",
      "test.mints.all:rows",
    ]);
  });

  test("a union collection: key, :rows, :groups", () => {
    const c = liveCollection("test.mints.arms", {
      row: Row,
      id: "id",
      arms: { discriminator: "kind" },
      scroll: true,
      filterable: {},
      sortable: ["n"],
      default: { orderBy: [["n", "asc"]], limit: 10 },
      maxLimit: 30,
    });
    expect(
      scannedMints(
        "test.mints.arms",
        `{ row: Row, id: "id", arms: { discriminator: "kind" }, scroll: true, filterable: {}, sortable: ["n"], default: { orderBy: [["n", "asc"]], limit: 10 }, maxLimit: 30 }`,
      ),
    ).toEqual(runtimeMints(c));
  });

  test("two exclusive mints of one key are refused, naming both fields", () => {
    expect(() =>
      scannedMints(
        "both",
        `{ row: Row, id: "id", default: { orderBy: [], limit: 1 }, all: { orderBy: [], unbounded: { reason: "r" } } }`,
      ),
    ).toThrow(
      /x\.ts:1: one declaration mints the key suffix "" twice — its spec sets both `default` and `all`/,
    );
  });

  test("a field nested inside the spec is not the spec's", () => {
    expect(
      scannedMints(
        "nested",
        `{ row: z.object({ all: z.string() }), id: "id", meta: { all: true, default: 1 } }`,
      ).map((m) => m.key),
    ).toEqual(["nested:rows"]);
  });

  test("presence it cannot read is refused, never guessed absent", () => {
    // A shorthand `all` mints `k` at runtime, but there is no `all:` to find.
    expect(() =>
      scannedMints("short", `{ row: Row, id: "id", all, preload: "boot" }`),
    ).toThrow(
      /x\.ts:1: the spec names `all` as a shorthand property .* Write `all: all`/,
    );
    // A spread may carry `all` (or `default`): presence is unknowable.
    expect(() =>
      scannedMints("spread", `{ ...base, preload: "boot" }`),
    ).toThrow(/x\.ts:1: the spec spreads `\.\.\.base`/);
    // A shorthand that is not a `requires` field, and a spread nested below
    // the spec's own depth, are readable.
    expect(
      scannedMints(
        "fine",
        `{ row, id: "id", meta: { ...extra }, all: { orderBy: [], unbounded: { reason: "r" } } }`,
      ).map((m) => m.key),
    ).toEqual(["fine", "fine:rows"]);
  });

  test("a spec that is not an inline object literal is refused", () => {
    // An identifier: no field is in the call's text at all.
    expect(() => scannedMints("ident", "spec")).toThrow(
      /x\.ts:1: the spec \(`spec`\) is not an inline object literal .* write the spec inline/,
    );
    // A wrapper call: the inner literal is the wrapper's argument, not the spec.
    expect(() =>
      scannedMints("wrapped", `makeSpec({ row: Row, id: "id", all: {} })`),
    ).toThrow(
      /x\.ts:1: the spec \(`makeSpec\(\{ .*`\) is not an inline object literal/,
    );
    // A literal the spec only starts with (`as const`, a member access).
    expect(() =>
      scannedMints("cast", `{ row: Row, id: "id" } as const`),
    ).toThrow(/is not an inline object literal/);
    // No spec at all.
    expect(() =>
      mintsOf(resourceDescriptorFactories.liveCollection, `"bare"`, WHERE),
    ).toThrow(/x\.ts:1: the spec \(no spec\) is not an inline object literal/);
    // Surrounding whitespace, comments and a trailing comma are fine.
    expect(
      scannedMints(
        "spaced",
        `\n  /* spec */ { row: Row, id: "id" } // done\n,`,
      ).map((m) => m.key),
    ).toEqual(["spaced:rows"]);
  });

  test("a factory with no `requires` mint never reads its spec", () => {
    expect(
      mintsOf(resourceDescriptorFactories.liveValue, `"v", spec`, WHERE),
    ).toEqual(resourceDescriptorFactories.liveValue.mints);
  });
});
