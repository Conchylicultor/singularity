import { expect, test } from "bun:test";
import {
  DECLARATION_CALL_PATTERN,
  appOfPluginPath,
  evaluateDataDirDeclarations,
  evaluateDeclarationCallSites,
  ownerForPluginPath,
} from "./app-data-dirs";
import type { DataDirDeclaration } from "./app-data-dirs";
import type { DataDirSpec } from "./data-dir";

// Hand-built literals, the `legacy-layout.test.ts` style: each rule is shown
// failing on the smallest declaration set that breaks it, and passing on the
// layout it is meant to produce.

const META = { desktop: "apps-core" } as const;

const never = { kind: "never", reason: "only copy" } as const;
const safe = { kind: "safe" } as const;

function decl(
  pluginPath: string,
  spec: Partial<DataDirSpec> & Pick<DataDirSpec, "kind" | "name">,
): DataDirDeclaration {
  return {
    pluginPath,
    spec: {
      owner: ownerForPluginPath(pluginPath),
      description: "fixture",
      reclaim: never,
      ...spec,
    },
  };
}

test("the layout the design produces passes every rule", () => {
  const offenders = evaluateDataDirDeclarations(
    [
      decl("apps/plugins/prototypes", { kind: "apps", name: "prototypes" }),
      decl("apps/plugins/sonata", { kind: "apps", name: "sonata" }),
      // The desktop meta-app, declared from its META_APP_ROOTS root.
      decl("apps-core", { kind: "apps", name: "desktop" }),
      // A re-derivable cache inside an app's subtree is allowed outside the app dir.
      decl("apps/plugins/prototypes/plugins/thumbnails", {
        kind: "cache",
        name: "prototypes-thumbnails",
        reclaim: safe,
      }),
      // Shared infra keeps its durable dirs under state/.
      decl("infra/plugins/attachments", { kind: "state", name: "attachments" }),
    ],
    META,
  );
  expect(offenders).toEqual([]);
});

test("owner is derived by dropping every /plugins/ segment", () => {
  expect(ownerForPluginPath("apps/plugins/prototypes/plugins/files")).toBe(
    "apps/prototypes/files",
  );
  expect(ownerForPluginPath("apps-core")).toBe("apps-core");
  expect(ownerForPluginPath("apps-core/plugins/surface/plugins/floating")).toBe(
    "apps-core/surface/floating",
  );
});

test("the app a plugin sits in: apps/plugins/<x> and below, or a meta-app root and below", () => {
  expect(appOfPluginPath("apps/plugins/prototypes", META)).toBe("prototypes");
  expect(
    appOfPluginPath("apps/plugins/prototypes/plugins/files/plugins/x", META),
  ).toBe("prototypes");
  expect(appOfPluginPath("apps-core", META)).toBe("desktop");
  expect(
    appOfPluginPath(
      "apps-core/plugins/surface/plugins/floating/plugins/wallpaper",
      META,
    ),
  ).toBe("desktop");
  // Neither the `apps` umbrella itself nor a name that merely STARTS like a root.
  expect(appOfPluginPath("apps", META)).toBeNull();
  expect(appOfPluginPath("apps-core-extras", META)).toBeNull();
  expect(appOfPluginPath("infra/plugins/attachments", META)).toBeNull();
});

// ── A ────────────────────────────────────────────────────────────────────────

test("A: a second apps/* dir from inside an app fails, and points at subdir()", () => {
  // The miss that motivated the rule.
  const [offender, ...rest] = evaluateDataDirDeclarations(
    [
      decl("apps/plugins/prototypes/plugins/files", {
        kind: "apps",
        name: "prototype-history",
      }),
    ],
    META,
  );
  expect(rest).toEqual([]);
  expect(offender).toContain(
    'apps/prototype-history is declared by apps/plugins/prototypes/plugins/files, which is inside app "prototypes"',
  );
  expect(offender).toContain(
    'prototypesDir.subdir("prototype-history") from plugins/apps/plugins/prototypes/data-dirs/index.ts',
  );
});

test("A: an app's own dir declared from a sub-plugin fails, and says to move it to the root", () => {
  const offenders = evaluateDataDirDeclarations(
    [
      decl("apps/plugins/sonata/plugins/sources/plugins/midi/plugins/folders", {
        kind: "apps",
        name: "sonata",
      }),
    ],
    META,
  );
  expect(offenders).toHaveLength(1);
  expect(offenders[0]).toContain('a sub-plugin of app "sonata"');
  expect(offenders[0]).toContain(
    "move the defineAppDataDir call to plugins/apps/plugins/sonata/data-dirs/index.ts",
  );
});

test("A: an apps/* dir named for no app, from outside any app, fails", () => {
  const offenders = evaluateDataDirDeclarations(
    [decl("infra/plugins/attachments", { kind: "apps", name: "attachments" })],
    META,
  );
  expect(offenders).toHaveLength(1);
  expect(offenders[0]).toContain(
    "declared only by its app's root plugin — plugins/apps/plugins/attachments/data-dirs/index.ts",
  );
  expect(offenders[0]).toContain("META_APP_ROOTS");
});

test("A: a meta-app's dir is declared by its META_APP_ROOTS root, and nowhere else", () => {
  const fromBelow = evaluateDataDirDeclarations(
    [
      decl("apps-core/plugins/surface/plugins/floating/plugins/wallpaper", {
        kind: "apps",
        name: "desktop",
      }),
    ],
    META,
  );
  expect(fromBelow).toHaveLength(1);
  expect(fromBelow[0]).toContain("plugins/apps-core/data-dirs/index.ts");

  // And an app folder cannot claim a meta-app's name.
  const impostor = evaluateDataDirDeclarations(
    [decl("apps/plugins/desktop", { kind: "apps", name: "desktop" })],
    META,
  );
  expect(impostor).toHaveLength(1);
});

// ── B ────────────────────────────────────────────────────────────────────────

test("B: durable (reclaim: never) data declared inside an app, outside its app dir, fails", () => {
  // The escape route beside rule A: `state/prototype-history`.
  const offenders = evaluateDataDirDeclarations(
    [
      decl("apps/plugins/prototypes/plugins/files", {
        kind: "state",
        name: "prototype-history",
      }),
    ],
    META,
  );
  expect(offenders).toHaveLength(1);
  expect(offenders[0]).toContain(
    'durable data of app prototypes belongs in apps/prototypes — delete this declaration and use prototypesDir.subdir("prototype-history")',
  );
});

test("B: applies to a meta-app's subtree too", () => {
  const offenders = evaluateDataDirDeclarations(
    [
      decl("apps-core/plugins/surface/plugins/floating/plugins/wallpaper", {
        kind: "state",
        name: "wallpaper",
      }),
    ],
    META,
  );
  expect(offenders).toHaveLength(1);
  expect(offenders[0]).toContain('desktopDir.subdir("wallpaper")');
});

test("B: reclaimable kinds inside an app are allowed", () => {
  for (const reclaim of [
    safe,
    { kind: "restart" } as const,
    { kind: "ttl", ttlDays: 7 } as const,
    { kind: "keep", keep: 3 } as const,
  ])
    expect(
      evaluateDataDirDeclarations(
        [
          decl("apps/plugins/prototypes/plugins/thumbnails", {
            kind: "cache",
            name: "prototypes-thumbnails",
            reclaim,
          }),
        ],
        META,
      ),
    ).toEqual([]);
});

test("B: durable data outside every app is not this rule's business", () => {
  expect(
    evaluateDataDirDeclarations(
      [decl("config_v2", { kind: "state", name: "config" })],
      META,
    ),
  ).toEqual([]);
});

// ── C ────────────────────────────────────────────────────────────────────────

test("C: an owner that is not the declaring plugin's path fails, naming the right one", () => {
  const offenders = evaluateDataDirDeclarations(
    [
      decl("framework/plugins/tooling/plugins/checks", {
        kind: "cache",
        name: "check",
        reclaim: safe,
        owner: "checks",
      }),
    ],
    META,
  );
  expect(offenders).toHaveLength(1);
  expect(offenders[0]).toContain(
    'carries owner "checks" — the owner is the declaring plugin\'s path with /plugins/ removed: "framework/tooling/checks"',
  );
});

test("C: another plugin's DataDir re-exported in a default export fails for the foreign appearance only", () => {
  const spec: DataDirSpec = {
    kind: "state",
    name: "config",
    owner: "config_v2",
    description: "fixture",
    reclaim: never,
  };
  const offenders = evaluateDataDirDeclarations(
    [
      { pluginPath: "config_v2", spec },
      { pluginPath: "infra/plugins/secrets", spec },
    ],
    META,
  );
  expect(offenders).toHaveLength(1);
  expect(offenders[0]).toContain(
    "state/config is exported by infra/plugins/secrets/data-dirs",
  );
  expect(offenders[0]).toContain(
    "do not list it in this plugin's data-dirs default export",
  );
});

// ── D ────────────────────────────────────────────────────────────────────────

test("D: the call pattern matches calls, not imports or type positions", () => {
  expect(
    DECLARATION_CALL_PATTERN.test("export const x = defineDataDir({"),
  ).toBe(true);
  expect(
    DECLARATION_CALL_PATTERN.test(
      "const d = defineAppDataDir(prototypesApp, {",
    ),
  ).toBe(true);
  expect(DECLARATION_CALL_PATTERN.test("return defineDataDir ({")).toBe(true);
  expect(
    DECLARATION_CALL_PATTERN.test(
      'import { defineDataDir } from "@plugins/infra/plugins/paths/core";',
    ),
  ).toBe(false);
  expect(
    DECLARATION_CALL_PATTERN.test("type T = ReturnType<typeof defineDataDir>;"),
  ).toBe(false);
  expect(DECLARATION_CALL_PATTERN.test("redefineDataDir(x)")).toBe(false);
});

test("D: a declaring call outside a data-dirs/index.ts fails; tests and the paths plugin are exempt", () => {
  const site = (path: string) => ({
    path,
    line: 7,
    text: "  export const d = defineDataDir({   ",
  });
  const offenders = evaluateDeclarationCallSites([
    // Allowed: the collected file, at any depth.
    site("plugins/debug/data-dirs/index.ts"),
    site("plugins/apps/plugins/prototypes/data-dirs/index.ts"),
    // Exempt.
    site(
      "plugins/packages/plugins/host-semaphore/server/internal/host-semaphore.test.ts",
    ),
    site("plugins/apps-core/web/__tests__/wallpaper.test.tsx"),
    site("plugins/infra/plugins/paths/core/internal/data-dir.ts"),
    // Offenders: invisible to codegen's collection.
    site(
      "plugins/apps/plugins/prototypes/plugins/files/server/internal/history.ts",
    ),
    site("plugins/debug/data-dirs/extra.ts"),
  ]);
  expect(offenders).toHaveLength(2);
  expect(offenders[0]).toStartWith(
    "plugins/apps/plugins/prototypes/plugins/files/server/internal/history.ts:7: export const d = defineDataDir({ — ",
  );
  expect(offenders[1]).toStartWith("plugins/debug/data-dirs/extra.ts:7:");
});
