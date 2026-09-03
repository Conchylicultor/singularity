import { describe, expect, test } from "bun:test";
import { maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";
import {
  findCalls,
  paneDeclarationsIn,
  parsePropsBlock,
  routeDeclarationsIn,
} from "./static-parse";

// findCalls locates calls over a fully-masked buffer and slices callee/argsBody
// from the original at the aligned offsets — exactly as the facet caller does
// (`maskSource(stripped)` + the block slice). maskSource preserves length, so a
// snippet and its mask index 1:1.
const calls = (block: string) => findCalls(maskSource(block), block);

describe("findCalls", () => {
  test("captures a bare-identifier-arg contribution call", () => {
    expect(calls("DataViewSlots.Filter(textOperatorSet)")).toEqual([
      { callee: "DataViewSlots.Filter", argsBody: "" },
    ]);
  });

  test("still captures and parses an inline object-literal argument", () => {
    const found = calls(
      `DataViewSlots.Cell({ match: "bool", component: BoolCell })`,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.callee).toBe("DataViewSlots.Cell");
    const props = parsePropsBlock(found[0]!.argsBody);
    expect(props.match).toContain("bool");
  });

  test("does not emit a phantom slot for a dotted call nested inside an argument", () => {
    const found = calls(`DataViewSlots.Cell({ component: wrap(Foo.bar(x)) })`);
    expect(found.map((c) => c.callee)).toEqual(["DataViewSlots.Cell"]);
  });

  test("does not false-match a dotted call inside a preserved string", () => {
    const found = calls(
      `DataViewSlots.Filter(set /* */) , X.y({ label: "a.b(c" })`,
    );
    expect(found.map((c) => c.callee)).toEqual(["DataViewSlots.Filter", "X.y"]);
  });
});

// ── Pane / route identity ──────────────────────────────────────────
//
// A pane's id is spelled two ways. The legacy segment form puts a literal `id:`
// on the `Pane.define` call. The route form puts a `route:` identifier there and
// the id on the `defineRoute()` that identifier names — which routinely lives in
// another plugin's `core/`, so all this half can do is record WHICH name in
// WHICH module; `relate()` completes the join with the tree in scope.

describe("routeDeclarationsIn", () => {
  test("reads the binding name and the route id", () => {
    expect(
      routeDeclarationsIn(`
        export const buildRoute = defineRoute({ id: "build", segment: "build" });
        const detail = defineRoute({
          id: "build-detail",
          segment: "r/:runId",
          parent: buildRoute,
        });
      `),
    ).toEqual([
      { name: "buildRoute", routeId: "build" },
      { name: "detail", routeId: "build-detail" },
    ]);
  });

  test("a defineRoute written inside a string or a comment is not a route", () => {
    expect(
      routeDeclarationsIn(`
        // const ghostRoute = defineRoute({ id: "ghost", segment: "g" });
        const snippet = \`const alsoGhost = defineRoute({ id: "also-ghost" })\`;
        const realRoute = defineRoute({ id: "real", segment: "r" });
      `),
    ).toEqual([{ name: "realRoute", routeId: "real" }]);
  });

  test("a dynamically-built id is no id, not a phantom one", () => {
    expect(
      routeDeclarationsIn(
        'const r = defineRoute({ id: prefix + "-detail", segment: "s" });',
      ),
    ).toEqual([]);
  });
});

describe("paneDeclarationsIn", () => {
  test("legacy form: the literal id on the call", () => {
    expect(
      paneDeclarationsIn(`
      export const logsPane = Pane.define({
        id: "logs",
        app: debugApp,
        segment: "logs",
      });
    `),
    ).toEqual([{ name: "logsPane", id: "logs" }]);
  });

  test("route form: the route's name and the module it came from", () => {
    expect(
      paneDeclarationsIn(`
      import { buildRoute } from "@plugins/build/core";
      export const buildPane = Pane.define({ route: buildRoute, app: buildApp });
    `),
    ).toEqual([
      {
        name: "buildPane",
        route: { name: "buildRoute", module: "@plugins/build/core" },
      },
    ]);
  });

  test("a route declared in the same file carries no module", () => {
    expect(
      paneDeclarationsIn(`
      const localRoute = defineRoute({ id: "local", segment: "l" });
      export const localPane = Pane.define({ route: localRoute, app: someApp });
    `)[0],
    ).toEqual({ name: "localPane", route: { name: "localRoute" } });
  });

  test("an import alias resolves to the name the route is EXPORTED under", () => {
    expect(
      paneDeclarationsIn(`
      import { reportsRootRoute as rootRoute } from "@plugins/reports/core";
      export const reportsPane = Pane.define({ route: rootRoute, app: debugApp });
    `)[0]?.route,
    ).toEqual({
      name: "reportsRootRoute",
      module: "@plugins/reports/core",
    });
  });

  // The reader must scope both fields to the TOP level of the call body. With a
  // first-match-at-any-depth read, the `id` inside `chrome` becomes the pane id
  // and the `route` inside `options` becomes its route — silently, and with no
  // check anywhere to notice.
  test("a nested id / route never shadows the call's own", () => {
    expect(
      paneDeclarationsIn(`
      import { realRoute } from "./routes";
      export const p = Pane.define({
        chrome: { title: (params) => params.id, id: "nested-id" },
        options: { route: decoyRoute },
        route: realRoute,
        app: someApp,
      });
    `),
    ).toEqual([
      { name: "p", route: { name: "realRoute", module: "./routes" } },
    ]);
  });

  test("a call spelling neither identity is dropped rather than half-recorded", () => {
    expect(
      paneDeclarationsIn("const p = Pane.define({ app: someApp });"),
    ).toEqual([]);
  });

  test("a Pane.define written inside a template literal is not a pane", () => {
    expect(
      paneDeclarationsIn(
        'const tpl = `const ghostPane = Pane.define({ id: "ghost" })`;',
      ),
    ).toEqual([]);
  });
});
