import { describe, expect, it } from "bun:test";
import {
  CRUMBS,
  MAX_SUGGESTIONS,
  commitTarget,
  editText,
  pathBarReducer,
  readyItems,
  splitSuggestion,
  type PathBarAction,
  type PathBarState,
} from "./path-bar-machine";

const run = (actions: PathBarAction[], from: PathBarState = CRUMBS) =>
  actions.reduce(pathBarReducer, from);

const ready = (forText: string, items: string[]): PathBarAction => ({
  type: "suggestions",
  forText,
  result: { kind: "ready", items },
});

describe("path-bar machine", () => {
  it("opens on the path plus one separator", () => {
    expect(editText("/vol/me", "/")).toBe("/vol/me/");
    expect(editText("/", "/")).toBe("/");
    const s = run([{ type: "start", text: "/vol/me/" }]);
    expect(s).toMatchObject({ mode: "editing", text: "/vol/me/" });
  });

  it("drops an answer to text no longer in the field", () => {
    const s = run([
      { type: "start", text: "/a/" },
      { type: "input", text: "/a/b" },
      ready("/a/", ["/a/old"]),
    ]);
    expect(readyItems(s)).toEqual([]);
    expect(readyItems(pathBarReducer(s, ready("/a/b", ["/a/bin"])))).toEqual([
      "/a/bin",
    ]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `/x/d${i}`);
    const s = run([{ type: "start", text: "/x/" }, ready("/x/", many)]);
    expect(readyItems(s)).toHaveLength(MAX_SUGGESTIONS);
  });

  it("moves the highlight round the list", () => {
    let s = run([
      { type: "start", text: "/x/" },
      ready("/x/", ["/x/a", "/x/b", "/x/c"]),
    ]);
    s = pathBarReducer(s, { type: "move", delta: 1 });
    expect(s).toMatchObject({ highlighted: 0 });
    s = pathBarReducer(s, { type: "move", delta: -1 });
    expect(s).toMatchObject({ highlighted: 2 });
    s = pathBarReducer(s, { type: "move", delta: 1 });
    expect(s).toMatchObject({ highlighted: 0 });
  });

  it("Tab completes the highlighted one, else the first, plus a separator", () => {
    const base = run([
      { type: "start", text: "/x/" },
      ready("/x/", ["/x/a", "/x/b"]),
    ]);
    expect(
      pathBarReducer(base, { type: "complete", separator: "/" }),
    ).toMatchObject({
      text: "/x/a/",
      highlighted: -1,
      suggestions: { kind: "pending" },
    });
    const moved = run(
      [
        { type: "move", delta: 1 },
        { type: "move", delta: 1 },
        { type: "complete", separator: "/" },
      ],
      base,
    );
    expect(moved).toMatchObject({ text: "/x/b/" });
  });

  it("commits the highlighted one, else the typed text without its trailing separator", () => {
    const typed = run([{ type: "start", text: "/x/y/" }]);
    expect(commitTarget(typed, "/")).toBe("/x/y");
    expect(commitTarget(run([{ type: "start", text: "/" }]), "/")).toBe("/");
    const picked = run(
      [ready("/x/y/", ["/x/y/z"]), { type: "move", delta: 1 }],
      typed,
    );
    expect(commitTarget(picked, "/")).toBe("/x/y/z");
  });

  it("an invalid commit stays editing, marked bad, until the text changes", () => {
    const bad = run([
      { type: "start", text: "/nope" },
      { type: "validating" },
      { type: "invalid", reason: "No such folder" },
    ]);
    expect(bad).toMatchObject({
      mode: "editing",
      validating: false,
      invalid: { reason: "No such folder" },
    });
    expect(pathBarReducer(bad, { type: "input", text: "/nop" })).toMatchObject({
      invalid: null,
    });
  });

  it("cancel goes back to the crumbs; nothing else acts outside editing", () => {
    const s = run([{ type: "start", text: "/x/" }, { type: "cancel" }]);
    expect(s).toBe(CRUMBS);
    expect(pathBarReducer(CRUMBS, { type: "input", text: "/q" })).toBe(CRUMBS);
  });

  it("splits a suggestion around the typed stem", () => {
    expect(splitSuggestion("/vol/me/Documents", "/vol/me/doc", "/")).toEqual({
      parent: "/vol/me/",
      match: "Doc",
      rest: "uments",
    });
    expect(splitSuggestion("/vol/me/Documents", "/vol/me/", "/")).toEqual({
      parent: "/vol/me/",
      match: "",
      rest: "Documents",
    });
    expect(splitSuggestion("/a/my-docs", "/a/docs", "/")).toEqual({
      parent: "/a/my-",
      match: "docs",
      rest: "",
    });
  });
});
