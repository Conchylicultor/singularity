import { describe, expect, test } from "bun:test";
import type {
  HostFsEntry,
  HostFsListResult,
} from "@plugins/infra/plugins/host-fs/core";
import { itemCount, type EntryFilter } from "./item-count";

const DIR = "~/src";

const entry = (name: string): HostFsEntry => ({
  name,
  kind: "file",
  size: 1,
  mtimeMs: 0,
  hidden: name.startsWith("."),
});
const listing = (...names: string[]): HostFsListResult => ({
  kind: "ok",
  path: "/srv/src",
  parent: "/srv",
  entries: names.map(entry),
});

const showAll: EntryFilter = () => true;
const hideDotfiles: EntryFilter = (e) => !e.hidden;
const hideIgnored: EntryFilter = (_e, path) => !path.endsWith("/dist");

describe("itemCount", () => {
  test("a listed folder counts its listing, never its peek", () => {
    const peek = {
      kind: "ok" as const,
      path: "/srv/src",
      children: [{ name: "stale", hidden: false }],
    };
    expect(
      itemCount(DIR, listing("a", ".b", "dist"), peek, hideDotfiles),
    ).toEqual({ kind: "count", n: 2 });
  });

  test("a peeked folder applies Show hidden files and the lens rules by path", () => {
    const peek = {
      kind: "ok" as const,
      path: "/srv/src",
      children: [
        { name: "a", hidden: false },
        { name: ".git", hidden: true },
        { name: "dist", hidden: false },
      ],
    };
    expect(itemCount(DIR, undefined, peek, showAll)).toEqual({
      kind: "count",
      n: 3,
    });
    expect(itemCount(DIR, undefined, peek, hideDotfiles)).toEqual({
      kind: "count",
      n: 2,
    });
    expect(itemCount(DIR, undefined, peek, hideIgnored)).toEqual({
      kind: "count",
      n: 2,
    });
  });

  test("an empty folder is a real 0; a failure never is", () => {
    expect(
      itemCount(
        DIR,
        undefined,
        { kind: "ok", path: "/x", children: [] },
        showAll,
      ),
    ).toEqual({ kind: "count", n: 0 });
    expect(
      itemCount(DIR, undefined, { kind: "denied", path: "/x" }, showAll),
    ).toEqual({ kind: "denied" });
    expect(
      itemCount(DIR, undefined, { kind: "missing", path: "/x" }, showAll),
    ).toEqual({ kind: "gone" });
    expect(
      itemCount(
        DIR,
        undefined,
        {
          kind: "unreadable-archive",
          path: "/x",
          archive: "/a",
          reason: "corrupt",
        },
        showAll,
      ),
    ).toEqual({ kind: "unreadable", reason: "corrupt" });
  });

  test("a folder with too many names reports its raw total", () => {
    expect(
      itemCount(
        DIR,
        undefined,
        { kind: "too-many", path: "/x", total: 12_345 },
        showAll,
      ),
    ).toEqual({ kind: "many", total: 12_345 });
  });

  test("a failed listing is its failure; neither listed nor peeked is loading", () => {
    expect(
      itemCount(DIR, { kind: "denied", path: "/x" }, undefined, showAll),
    ).toEqual({ kind: "denied" });
    expect(itemCount(DIR, null, undefined, showAll)).toEqual({
      kind: "loading",
    });
    expect(itemCount(DIR, undefined, undefined, showAll)).toEqual({
      kind: "loading",
    });
  });
});
