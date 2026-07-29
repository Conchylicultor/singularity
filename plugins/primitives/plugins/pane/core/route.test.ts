import { describe, expect, test } from "bun:test";
import { defineApp, defineRoute, normalizeRoutePath } from "./route";

const agents = defineApp({ id: "agent-manager", basePath: "/agents", iconKey: "chat_bubble" });
const rootApp = defineApp({ id: "home", basePath: "/", iconKey: "home" });

describe("route link builder", () => {
  test("root route links under the app base path", () => {
    const tasks = defineRoute({ id: "tasks-root", segment: "tasks" });
    expect(tasks.path({})).toBe("/tasks");
    expect(tasks.link(agents, {})).toBe("/agents/tasks");
    expect(tasks.parentPaneIds).toEqual([]);
  });

  test("nested route concatenates the ancestor chain", () => {
    const build = defineRoute({ id: "build", segment: "build" });
    const detail = defineRoute({
      id: "build-detail",
      segment: "r/:runId",
      parent: build,
    });
    expect(detail.path({ runId: "abc" })).toBe("/build/r/abc");
    expect(detail.link(agents, { runId: "abc" })).toBe("/agents/build/r/abc");
    expect(detail.parentPaneIds).toEqual(["build"]);
  });

  test("param values are URL-encoded", () => {
    const conv = defineRoute({ id: "conversation", segment: "c/:convId" });
    expect(conv.link(agents, { convId: "a/b c" })).toBe("/agents/c/a%2Fb%20c");
  });

  test("root app (basePath '/') contributes no prefix", () => {
    const page = defineRoute({ id: "page", segment: "p/:id" });
    expect(page.link(rootApp, { id: "x" })).toBe("/p/x");
  });

  test("missing param fails loud", () => {
    const detail = defineRoute({ id: "d", segment: "r/:runId" });
    // @ts-expect-error — runId is required
    expect(() => detail.path({})).toThrow(/Missing param "runId"/);
  });
});

describe("normalizeRoutePath", () => {
  test("collapses a repeated leading slash — the scheme-relative crash", () => {
    // `//agents/c/x` handed to replaceState resolves to `http://agents/c/x`
    // (different origin ⇒ SecurityError), and misses `startsWith("/agents/")`.
    expect(normalizeRoutePath("//agents/c/x")).toBe("/agents/c/x");
    expect(normalizeRoutePath("///agents")).toBe("/agents");
  });

  test("collapses repeated slashes anywhere in the path", () => {
    expect(normalizeRoutePath("/agents//c///x")).toBe("/agents/c/x");
  });

  test("guarantees a leading slash", () => {
    expect(normalizeRoutePath("agents/c/x")).toBe("/agents/c/x");
    expect(normalizeRoutePath("")).toBe("/");
  });

  test("leaves an already-canonical path (and its trailing slash) alone", () => {
    expect(normalizeRoutePath("/")).toBe("/");
    expect(normalizeRoutePath("/agents/c/x")).toBe("/agents/c/x");
    expect(normalizeRoutePath("/agents/")).toBe("/agents/");
  });

  test("is idempotent, so re-normalizing is always safe", () => {
    const once = normalizeRoutePath("//agents//c/x");
    expect(normalizeRoutePath(once)).toBe(once);
  });

  test("does not decode or otherwise touch encoded segments", () => {
    expect(normalizeRoutePath("//agents/c/a%2Fb%20c")).toBe("/agents/c/a%2Fb%20c");
  });
});
