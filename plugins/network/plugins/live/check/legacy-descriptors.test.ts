import { describe, expect, test } from "bun:test";
import ts from "typescript";
import {
  findLegacyDescriptorCalls,
  legacyDescriptorViolations,
  PINNED_LEGACY_DESCRIPTORS,
} from "./legacy-descriptors";

const IMPORT = 'import { resourceDescriptor } from "../live-state";\n';
const PAGES = `${IMPORT}export const pagesResource = resourceDescriptor<Row[]>(\n  "pages",\n  S,\n  [],\n);\n`;
const LINKS = `${IMPORT}export const pageLinksResource = resourceDescriptor<Edge[]>("page-links", S, []);\n`;

const scan = (...srcs: string[]) =>
  legacyDescriptorViolations(
    findLegacyDescriptorCalls(
      ts,
      srcs.map((src, i) => ({ rel: `f${i}.ts`, src })),
    ),
  );

describe("live:legacy-descriptors-pinned", () => {
  test("pins exactly the two page resources", () => {
    expect(PINNED_LEGACY_DESCRIPTORS).toEqual([
      "pagesResource",
      "pageLinksResource",
    ]);
  });

  test("the two pinned declarations pass", () => {
    expect(scan(PAGES, LINKS)).toEqual([]);
  });

  test("a new bare resourceDescriptor is named, whatever it binds", () => {
    expect(
      scan(
        PAGES,
        LINKS,
        `${IMPORT}export const tasksResource = resourceDescriptor("t", S, []);`,
      ),
    ).toEqual(["f2.ts:2 — tasksResource: a new legacy resourceDescriptor"]);
  });

  test("an import alias is still the legacy spelling", () => {
    expect(
      scan(
        PAGES,
        LINKS,
        'import { resourceDescriptor as rd } from "../live-state";\nconst x = rd("x", S, null);',
      ),
    ).toEqual(["f2.ts:2 — x: a new legacy resourceDescriptor"]);
  });

  test("a call no const binds is reported, not skipped", () => {
    expect(
      scan(
        PAGES,
        LINKS,
        `${IMPORT}register(resourceDescriptor("x", S, null));`,
      ),
    ).toEqual(["f2.ts:2 — a resourceDescriptor(…) call no `const` binds"]);
  });

  test("a pinned name no call declares any more must leave the pin", () => {
    expect(scan(PAGES)).toEqual([
      "pageLinksResource — pinned, but no resourceDescriptor(…) declares it any more: remove it from PINNED_LEGACY_DESCRIPTORS",
    ]);
  });

  test("other spellings, non-namespace member calls, comments and strings are not the spelling", () => {
    expect(
      scan(
        PAGES,
        LINKS,
        [
          'const k = keyedResourceDescriptor("k", S, []);',
          'const q = queryResourceDescriptor("q");',
          'const m = live.resourceDescriptor("m", S, null);',
          '// const c = resourceDescriptor("c", S, null);',
          'const s = "resourceDescriptor(\\"s\\")";',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("a namespace import's member is the spelling, pinned or not", () => {
    const NS =
      'import * as ls from "@plugins/primitives/plugins/live-state/core";\n';
    expect(
      scan(
        `${NS}export const pagesResource = ls.resourceDescriptor("pages", S, []);`,
        LINKS,
        `${NS}export const tasksResource = ls.resourceDescriptor("t", S, []);`,
      ),
    ).toEqual(["f2.ts:2 — tasksResource: a new legacy resourceDescriptor"]);
  });

  test("a reference that is not a call escapes the pin and is reported", () => {
    const NS = 'import * as ls from "../live-state";\n';
    expect(
      scan(
        PAGES,
        LINKS,
        `${IMPORT}const rd = resourceDescriptor;\nregister({ resourceDescriptor });`,
        `${NS}const alias = ls.resourceDescriptor;\nconst { resourceDescriptor: d } = ls;`,
      ),
    ).toEqual([
      "f2.ts:2 — resourceDescriptor referenced without being called: an alias or a passed-along reference escapes the pin",
      "f2.ts:3 — resourceDescriptor referenced without being called: an alias or a passed-along reference escapes the pin",
      "f3.ts:2 — resourceDescriptor referenced without being called: an alias or a passed-along reference escapes the pin",
      "f3.ts:3 — resourceDescriptor referenced without being called: an alias or a passed-along reference escapes the pin",
    ]);
  });

  test("declaration names, barrel specifiers, keys and type queries are not references", () => {
    expect(
      scan(
        PAGES,
        LINKS,
        [
          "export function resourceDescriptor(key: string) { return key; }",
          'export { resourceDescriptor } from "./resource";',
          "const vocab = { resourceDescriptor: 1 };",
          "type R = ReturnType<typeof resourceDescriptor>;",
          "interface I { resourceDescriptor: string }",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("a cast or satisfies around the call still binds the const", () => {
    expect(
      scan(
        `${IMPORT}export const pagesResource = (resourceDescriptor("pages", S, []) as X);`,
        `${IMPORT}export const pageLinksResource = resourceDescriptor("page-links", S, []) satisfies X;`,
      ),
    ).toEqual([]);
  });
});
