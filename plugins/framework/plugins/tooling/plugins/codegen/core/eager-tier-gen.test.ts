/**
 * Unit tests for the PURE core of the eager-tier generator (`computeEagerTier`),
 * the structural predicate (`isAppContent`), and the per-file boot-critical key
 * scan (`bootCriticalKeysIn`), driven by synthetic inputs — no filesystem. Covers: the structural rule, watched-slot pins, bootCritical pins,
 * the reachability throw, the dependsOn closure pulling a dep of an eager shell
 * out of deferral, and deterministic sorted output — and the scan over a file
 * set (which files it reads). Run with `bun test`.
 */

import { test, expect, describe } from "bun:test";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { RepoFiles } from "@plugins/framework/plugins/tooling/core";
import { classifyEdges } from "@plugins/plugin-meta/plugins/closure/core";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  bootCriticalKeysIn,
  computeEagerTier,
  isAppContent,
  renderEagerTierManifest,
} from "./eager-tier-gen";
import type { RegistryGenContext } from "./plugin-registry-gen";

describe("isAppContent", () => {
  test("app content = apps/plugins/<app>/plugins/<child> with child !== shell", () => {
    expect(isAppContent("apps/plugins/sonata/plugins/notation")).toBe(true);
    expect(isAppContent("apps/plugins/sonata/plugins/notation/plugins/x")).toBe(
      true,
    );
  });

  test("shell subtree is NOT app content", () => {
    expect(isAppContent("apps/plugins/sonata/plugins/shell")).toBe(false);
    expect(isAppContent("apps/plugins/sonata/plugins/shell/plugins/x")).toBe(
      false,
    );
  });

  test("app umbrella and non-apps plugins are NOT app content", () => {
    expect(isAppContent("apps/plugins/sonata")).toBe(false);
    expect(isAppContent("conversations")).toBe(false);
    expect(isAppContent("primitives/plugins/pane")).toBe(false);
  });
});

const noDeps = new Map<string, string[]>();

describe("computeEagerTier", () => {
  test("structural rule: non-app-content eager, plain app content defers", () => {
    const { deferred } = computeEagerTier({
      webEntryPaths: [
        "conversations",
        "apps/plugins/sonata/plugins/shell",
        "apps/plugins/sonata/plugins/notation",
      ],
      deps: noDeps,
      bootCriticalOwners: [],
      watchedSlotHits: [],
    });
    expect(deferred).toEqual(["apps/plugins/sonata/plugins/notation"]);
  });

  test("watched-slot hit pins an app-content plugin eager", () => {
    const { deferred, appContentPins } = computeEagerTier({
      webEntryPaths: [
        "apps/plugins/agent-manager/plugins/shell",
        "apps/plugins/agent-manager/plugins/worktree-switcher",
      ],
      deps: noDeps,
      bootCriticalOwners: [],
      watchedSlotHits: [
        {
          path: "apps/plugins/agent-manager/plugins/worktree-switcher",
          slot: "ActionBar.Item",
        },
      ],
    });
    expect(deferred).toEqual([]);
    expect(appContentPins).toEqual([
      {
        path: "apps/plugins/agent-manager/plugins/worktree-switcher",
        reason: "watched boot slot ActionBar.Item",
      },
    ]);
  });

  test("bootCritical descriptor pins its owning plugin eager", () => {
    const { deferred, appContentPins } = computeEagerTier({
      // A top-level (non-app-content) owner — eager anyway, but annotated nowhere
      // (only app-content pins are listed). Use an app-content owner to see a pin.
      webEntryPaths: ["apps/plugins/mail/plugins/sync"],
      deps: noDeps,
      bootCriticalOwners: [
        { path: "apps/plugins/mail/plugins/sync", keys: ["mailSync"] },
      ],
      watchedSlotHits: [],
    });
    expect(deferred).toEqual([]);
    expect(appContentPins).toEqual([
      {
        path: "apps/plugins/mail/plugins/sync",
        reason: "boot-critical descriptor (mailSync)",
      },
    ]);
  });

  test("reachability: a bootCritical owner with no web entry throws with the fix", () => {
    expect(() =>
      computeEagerTier({
        webEntryPaths: ["conversations"],
        deps: noDeps,
        bootCriticalOwners: [
          { path: "tasks/plugins/tasks-core", keys: ["tasks", "attempts"] },
        ],
        watchedSlotHits: [],
      }),
    ).toThrow(/tasks\/plugins\/tasks-core/);
  });

  test("closure: a dep of an eager shell is pulled out of deferral", () => {
    const { deferred, appContentPins } = computeEagerTier({
      webEntryPaths: [
        "apps/plugins/sonata/plugins/shell", // eager (structural)
        "apps/plugins/sonata/plugins/voicing", // app content, only reached via shell
        "apps/plugins/sonata/plugins/notation", // app content, unreferenced
      ],
      // shell imports voicing (forward edge shell → voicing).
      deps: new Map([
        [
          "apps/plugins/sonata/plugins/shell",
          ["apps/plugins/sonata/plugins/voicing"],
        ],
      ]),
      bootCriticalOwners: [],
      watchedSlotHits: [],
    });
    expect(deferred).toEqual(["apps/plugins/sonata/plugins/notation"]);
    expect(appContentPins).toEqual([
      {
        path: "apps/plugins/sonata/plugins/voicing",
        reason: "dependency closure (imported by an eager plugin)",
      },
    ]);
  });

  test("deterministic: deferred + pins are sorted regardless of input order", () => {
    const { deferred, appContentPins } = computeEagerTier({
      webEntryPaths: [
        "apps/plugins/z/plugins/b",
        "apps/plugins/a/plugins/y",
        "apps/plugins/a/plugins/x",
      ],
      deps: noDeps,
      bootCriticalOwners: [{ path: "apps/plugins/a/plugins/x", keys: ["k"] }],
      watchedSlotHits: [
        { path: "apps/plugins/a/plugins/y", slot: "Core.Root" },
      ],
    });
    expect(deferred).toEqual(["apps/plugins/z/plugins/b"]);
    expect(appContentPins).toEqual([
      {
        path: "apps/plugins/a/plugins/x",
        reason: "boot-critical descriptor (k)",
      },
      {
        path: "apps/plugins/a/plugins/y",
        reason: "watched boot slot Core.Root",
      },
    ]);
  });
});

describe("bootCriticalKeysIn", () => {
  test("reads a bootCritical key from every descriptor factory, bounded ones included", () => {
    // `windowQueryResourceDescriptor` is the case this scanner was blind to: it
    // kept its own four-name list and the bounded factories were never added, so
    // a boot-critical resource under `apps/plugins/**` silently stayed deferred.
    const src = `
      export const tasksResource = keyedResourceDescriptor<T[]>(
        "tasks", S, [], k, { bootCritical: true },
      );
      export const notificationsResource = windowQueryResourceDescriptor<N>(
        "notifications", S, "id", { defaultLimit: 200, bootCritical: true },
      );
      export const quietResource = resourceDescriptor<Q>("quiet", S, null);
    `;
    expect(bootCriticalKeysIn(src, "a.ts")).toEqual(["tasks", "notifications"]);
  });

  test("a factory's own declaration is not a bootCritical call", () => {
    // `opts: { defaultLimit: number; bootCritical?: true }` is a type position —
    // `bootCritical?:` is not the `bootCritical: true` field the scan reads.
    const src = `
      export function windowQueryResourceDescriptor<Row>(
        key: string, rowSchema: ZodParser<Row>, pkField: keyof Row & string,
        opts: { defaultLimit: number; bootCritical?: true },
      ): WindowQueryResourceContract<Row> { return d; }
    `;
    expect(bootCriticalKeysIn(src, "window.ts")).toEqual([]);
  });

  test("throws on a bootCritical declaration whose key is not a literal", () => {
    const src = `export const r = resourceDescriptor(RESOURCE_KEY, S, null, { bootCritical: true });`;
    expect(() => bootCriticalKeysIn(src, "r.ts")).toThrow(
      /r\.ts:1: resourceDescriptor/,
    );
    expect(() => bootCriticalKeysIn(src, "r.ts")).toThrow(/RESOURCE_KEY/);
  });

  test("ignores a factory call written inside a string or comment", () => {
    const src = `
      // export const x = resourceDescriptor("commented", S, null, { bootCritical: true });
      const label = "resourceDescriptor(\\"fake\\", S, null, { bootCritical: true })";
    `;
    expect(bootCriticalKeysIn(src, "s.ts")).toEqual([]);
  });
});

/** A `RepoFiles` over an in-memory `{ path: text }` map. */
function memRepo(root: string, files: Record<string, string>): RepoFiles {
  const paths = Object.keys(files).sort();
  return {
    root,
    all: () => paths,
    has: (p) => Object.hasOwn(files, p),
    under: (dir) =>
      dir === "" ? paths : paths.filter((p) => p.startsWith(`${dir}/`)),
    read: (p) => Promise.resolve(Object.hasOwn(files, p) ? files[p]! : null),
  };
}

function node(pluginsRoot: string, path: string): PluginNode {
  return {
    dir: `${pluginsRoot}/${path}`,
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

describe("the scan over a file set", () => {
  const WEB_ENTRY = "export default {};\n";
  const CALLS_CORE_ROOT = [
    'import { Core } from "@plugins/framework/plugins/web-sdk/core";',
    "export const root = Core.Root({ component: () => null });",
  ].join("\n");
  const APP = "apps/plugins/mail/plugins";

  async function render(files: Record<string, string>, paths: string[]) {
    const root = "/fixture";
    const repo = memRepo(root, files);
    const nodes = paths.map((p) => node(`${root}/plugins`, p));
    const tree = {
      pluginsRoot: `${root}/plugins`,
      byDir: new Map(nodes.map((n) => [n.dir, n])),
      byPath: new Map(nodes.map((n) => [n.path, n])),
      roots: nodes,
      facets: [],
    };
    const ctx: RegistryGenContext = {
      root,
      tree,
      graph: classifyEdges(tree),
      mainBundle: new Set(nodes.map((n) => n.id)),
      repo: () => Promise.resolve(repo),
      dirScans: new Map(),
    };
    return await renderEagerTierManifest(root, ctx);
  }

  test("a watched slot in a plugin's source pins it; the same call in a test does not", async () => {
    const manifest = await render(
      {
        [`plugins/${APP}/badge/web/index.ts`]: WEB_ENTRY,
        [`plugins/${APP}/badge/web/root.ts`]: CALLS_CORE_ROOT,
        [`plugins/${APP}/quiet/web/index.ts`]: WEB_ENTRY,
        [`plugins/${APP}/quiet/web/root.test.ts`]: CALLS_CORE_ROOT,
        [`plugins/${APP}/quiet/web/__tests__/root.tsx`]: CALLS_CORE_ROOT,
        [`plugins/${APP}/quiet/web/plugins/sub/root.ts`]: CALLS_CORE_ROOT,
      },
      [`${APP}/badge`, `${APP}/quiet`],
    );
    expect(manifest).toContain(
      `//   - ${APP}/badge: watched boot slot Core.Root`,
    );
    expect(manifest).toContain(`  "${APP}/quiet",`);
    expect(manifest).not.toContain(`  "${APP}/badge",`);
  });

  test("a bootCritical descriptor in core pins its plugin", async () => {
    const manifest = await render(
      {
        [`plugins/${APP}/sync/web/index.ts`]: WEB_ENTRY,
        [`plugins/${APP}/sync/core/resource.ts`]:
          'export const d = resourceDescriptor("mailSync", S, null, { bootCritical: true });\n',
      },
      [`${APP}/sync`],
    );
    expect(manifest).toContain("boot-critical descriptor (mailSync)");
    expect(manifest).not.toContain(`  "${APP}/sync",`);
  });
});
