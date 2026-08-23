/**
 * Regression test for the comment/string robustness of `discoverCollectedDirs`.
 *
 * The trigger bug: a `defineCollectedDir("…")` written inside a code comment (or
 * embedded in a string literal) was matched by a raw-text regex and silently
 * produced a phantom collected-dir registry. Routing the scan through
 * `findMarkerCalls` (which masks comments/strings/regex) must ignore those while
 * still discovering genuine calls. Run with `bun test` from the repo root.
 */

import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { classifyEdges } from "@plugins/plugin-meta/plugins/closure/core";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  collectedDirNamedCompositionRegistryPath,
  compositionRegistryFileName,
  compositionRegistryPath,
  discoverCollectedDirs,
  listNamedCompositionRegistries,
  parseNamedCompositionRegistryFileName,
  renderCollectedDirRegistry,
  type DiscoveredCollectedDir,
  type RegistryGenContext,
} from "./plugin-registry-gen";

const root = mkdtempSync(join(tmpdir(), "collected-dir-test-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Write a core/index.ts barrel for a plugin under <root>/plugins/<name>/core. */
function writeCoreBarrel(pluginName: string, contents: string) {
  const coreDir = join(root, "plugins", pluginName, "core");
  mkdirSync(coreDir, { recursive: true });
  writeFileSync(join(coreDir, "index.ts"), contents);
}

test("discoverCollectedDirs ignores commented/stringified markers but finds real calls", () => {
  writeCoreBarrel(
    "real",
    ['export const realDir = defineCollectedDir("widget");'].join("\n"),
  );
  writeCoreBarrel(
    "phantoms",
    [
      '// defineCollectedDir("phantom")',
      "const s = \"defineCollectedDir('stringed')\";",
      '/* block defineCollectedDir("blocked") */',
    ].join("\n"),
  );

  const dirs = discoverCollectedDirs(root)
    .map((d) => d.dir)
    .sort();

  // Only the genuine call is discovered; the comment- and string-embedded
  // markers must not produce phantom collected dirs.
  expect(dirs).toEqual(["widget"]);
});

// ── Per-name composition registries ────────────────────────────────
//
// The composition-name vocabulary itself (assertCompositionName, the
// reserved/owned split) is tested beside its source, in
// plugins/plugin-meta/plugins/composition/core/namespace.test.ts. What is tested
// HERE is only that the registry path builder routes a name through it.

test("per-name registry path renders and round-trips through parse", () => {
  const def: DiscoveredCollectedDir = {
    dir: "web",
    _brand: "CollectedDirDef",
    ownerDir: "/repo/plugins/framework/plugins/web-sdk",
  };
  const file = collectedDirNamedCompositionRegistryPath(def, "sonata");
  expect(file).toBe(
    "/repo/plugins/framework/plugins/web-sdk/core/web.composition.sonata.generated.ts",
  );
  expect(
    parseNamedCompositionRegistryFileName(
      "web.composition.sonata.generated.ts",
    ),
  ).toEqual({
    dir: "web",
    name: "sonata",
  });
  expect(() =>
    collectedDirNamedCompositionRegistryPath(def, "../evil"),
  ).toThrow("Invalid composition name");
});

/**
 * The one place that knows main's registry is the committed file.
 *
 * `singularity` is an ordinary composition — it just happens to be the one whose
 * closure is the whole tree, which is exactly what `plugins-registry-in-sync`
 * re-derives and asserts on every build. So asking for its registry must hand
 * back `<dir>.generated.ts`, and nothing may ever emit a
 * `<dir>.composition.singularity.generated.ts` for a backend to pick up by
 * presence.
 */
test("the main composition resolves to the committed registry, every other to a filtered one", () => {
  const def: DiscoveredCollectedDir = {
    dir: "server",
    _brand: "CollectedDirDef",
    ownerDir: "/repo/plugins/framework/plugins/server-core",
  };
  expect(compositionRegistryPath(def, "singularity")).toBe(
    "/repo/plugins/framework/plugins/server-core/core/server.generated.ts",
  );
  expect(compositionRegistryPath(def, "sonata")).toBe(
    "/repo/plugins/framework/plugins/server-core/core/server.composition.sonata.generated.ts",
  );
  // The filename half, which `release` asks directly (it holds a repo-relative
  // path, not a DiscoveredCollectedDir).
  expect(compositionRegistryFileName("web", "singularity")).toBe(
    "web.generated.ts",
  );
  expect(compositionRegistryFileName("web", "sonata")).toBe(
    "web.composition.sonata.generated.ts",
  );
  expect(() => compositionRegistryFileName("web", "../evil")).toThrow(
    "Invalid composition name",
  );
});

// The pre-S1 checkout-global singleton spelling is gone (S5): nothing writes,
// selects or reaps it. These two tests pin that a stray leftover of that name in
// an old checkout stays INERT — never parsed as a per-name registry, never
// listed as one (which would make the auto-serve sweep delete or adopt it).
test("parse rejects the singleton, committed, and non-registry file names", () => {
  expect(
    parseNamedCompositionRegistryFileName("web.composition.generated.ts"),
  ).toBeNull();
  expect(parseNamedCompositionRegistryFileName("web.generated.ts")).toBeNull();
  expect(
    parseNamedCompositionRegistryFileName(
      "web.composition.Sonata.generated.ts",
    ),
  ).toBeNull();
  expect(
    parseNamedCompositionRegistryFileName(
      "web.composition.sonata.generated.ts.bak",
    ),
  ).toBeNull();
});

test("listNamedCompositionRegistries finds per-name files, skipping singletons", () => {
  // The fake root's `widget` collected dir is not a composition runtime — build
  // a second fake root declaring the three that are: `web`, `server`, and
  // `prewarm` (per-name too since S1, so a deactivation sweep reclaims it).
  const namedRoot = mkdtempSync(join(tmpdir(), "named-registry-test-"));
  try {
    const coreDir = join(namedRoot, "plugins", "sdk", "core");
    mkdirSync(coreDir, { recursive: true });
    writeFileSync(
      join(coreDir, "index.ts"),
      [
        'export const webDir = defineCollectedDir("web");',
        'export const serverDir = defineCollectedDir("server");',
        'export const prewarmDir = defineCollectedDir("prewarm");',
      ].join("\n"),
    );
    for (const f of [
      "web.composition.sonata.generated.ts",
      "web.composition.generated.ts", // pre-S1 singleton stray — not per-name
      "server.composition.sonata.generated.ts",
      "server.composition.pages.generated.ts",
      "prewarm.composition.sonata.generated.ts",
      "web.generated.ts", // committed — never listed
    ]) {
      writeFileSync(join(coreDir, f), "export const x = [];\n");
    }

    const listed = listNamedCompositionRegistries(namedRoot)
      .map((e) => `${e.dir}:${e.name}`)
      .sort();
    expect(listed).toEqual([
      "prewarm:sonata",
      "server:pages",
      "server:sonata",
      "web:sonata",
    ]);
  } finally {
    rmSync(namedRoot, { recursive: true, force: true });
  }
});

// ── The bundle filter is the WHOLE filter ──────────────────────────
//
// Since Phase 7 a registry is always the registry OF a composition: `bundle` is
// required, and it is the only thing that decides who is emitted. These two tests
// pin that property directly, on a synthetic tree, so it holds independently of
// what any real manifest says:
//
//   • the full id set renders every entry, with the dependency graph intact —
//     this is what the committed `<dir>.generated.ts` files are (rendered with
//     `ctx.mainBundle`, which for `singularity` is every id it reaches);
//   • dropping ONE id from the bundle drops exactly that entry, and prunes it out
//     of any surviving entry's `dependsOn` — a dangling dep would break the
//     loader's topo-sort.

/** A `PluginNode` with only the fields the entry collector reads set meaningfully. */
function fakeNode(pluginsRoot: string, path: string): PluginNode {
  return {
    dir: join(pluginsRoot, path),
    path,
    name: path.split("/").at(-1)!,
    id: asPluginId(
      path
        .split("/")
        .filter((s) => s !== "plugins")
        .join("."),
    ),
    descriptions: {},
    loadBearing: false,
    collapsed: false,
    compositionRoot: false,
    runtimes: { web: true, server: false, central: false },
    children: [],
    facets: {},
  };
}

/**
 * A synthetic two-plugin tree: `beta/web` imports `alpha`'s web barrel, so the
 * emitted `beta` entry carries `dependsOn: ["alpha"]`.
 *
 * The ctx is built by hand rather than through `buildRegistryGenContext` on
 * purpose: what is under test is the renderer's bundle-dependence, and a
 * hand-built ctx keeps `graph`/`mainBundle` (which the renderer never reads) out
 * of the picture entirely.
 */
function bundleFixture(): {
  ctx: RegistryGenContext;
  def: DiscoveredCollectedDir;
} {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "registry-bundle-test-"));
  afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  const pluginsRoot = join(fixtureRoot, "plugins");
  for (const [name, src] of [
    ["alpha", "export default { name: 'alpha' };\n"],
    [
      "beta",
      'import x from "@plugins/alpha/web";\nexport default { name: "beta", x };\n',
    ],
  ] as const) {
    mkdirSync(join(pluginsRoot, name, "web"), { recursive: true });
    writeFileSync(join(pluginsRoot, name, "web", "index.ts"), src);
  }
  const nodes = [fakeNode(pluginsRoot, "alpha"), fakeNode(pluginsRoot, "beta")];
  const tree = {
    pluginsRoot,
    byDir: new Map(nodes.map((n) => [n.dir, n])),
    byPath: new Map(nodes.map((n) => [n.path, n])),
    roots: nodes,
    facets: [],
  };
  const ctx: RegistryGenContext = {
    root: fixtureRoot,
    tree,
    // Pure over `node.facets` (empty here) — the renderer never reads the graph;
    // it is on the ctx so every consumer shares one classify pass.
    graph: classifyEdges(tree),
    mainBundle: new Set(nodes.map((n) => n.id)),
    dirScans: new Map(),
  };
  return {
    ctx,
    def: { dir: "web", _brand: "CollectedDirDef", ownerDir: pluginsRoot },
  };
}

test("a bundle carrying every id renders every entry, with its deps", () => {
  const { ctx, def } = bundleFixture();
  const rendered = renderCollectedDirRegistry({
    ctx,
    def,
    bundle: ctx.mainBundle,
  });

  expect(rendered).toContain('id: "alpha"');
  expect(rendered).toContain('id: "beta"');
  expect(rendered).toContain('dependsOn: ["alpha"]');
  // Exactly one emitted entry per plugin — no duplicates, nothing dropped.
  expect(rendered.match(/^ {2}\{ pluginPath:/gm)).toHaveLength(2);
});

test("a bundle missing one id differs by exactly that entry, and prunes the dep on it", () => {
  const { ctx, def } = bundleFixture();
  const full = renderCollectedDirRegistry({ ctx, def, bundle: ctx.mainBundle });
  const withoutAlpha = renderCollectedDirRegistry({
    ctx,
    def,
    bundle: new Set([...ctx.mainBundle].filter((id) => id !== "alpha")),
  });

  expect(withoutAlpha).not.toContain('id: "alpha"');
  expect(withoutAlpha).toContain('id: "beta"');
  // `beta` survives, but its dependency on the absent `alpha` is pruned — a
  // dangling `dependsOn` would break the loader's topo-sort.
  expect(withoutAlpha).toContain("dependsOn: []");
  // The difference is exactly one entry line, not a reshuffle.
  const lines = (s: string) =>
    s.split("\n").filter((l) => l.startsWith("  { pluginPath:"));
  expect(lines(full)).toHaveLength(2);
  expect(lines(withoutAlpha)).toHaveLength(1);
});
