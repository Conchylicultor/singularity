import { describe, expect, it } from "bun:test";
import {
  buildDescriptorIndex,
  parseFileBindings,
  parseRegisterCalls,
  resolveRegisterCall,
  type DescriptorInfo,
  type FileBindings,
  type SourceFile,
} from "./parse-resources";

const NOTHING_IMPORTED = () => null;
const file = (
  src: string,
  path = "/repo/plugins/example/core/resources.ts",
): SourceFile => ({
  path,
  src,
});
const where = {
  file: "/repo/plugins/example/server/internal/resources.ts",
  line: 1,
};

describe("buildDescriptorIndex", () => {
  it("indexes each descriptor factory with its key, keyed-ness and membership", () => {
    const src = `
      export const tasksResource = keyedResourceDescriptor<TaskListItem[]>(
        "tasks", z.array(TaskListItemSchema), [], (r) => r.id, { preload: "boot" },
      );
      export const taskDetailResource = resourceDescriptor<Task | null, { id: string }>(
        "task-detail", TaskSchema.nullable(), null,
      );
      export const authState = liveValue("auth-state", {
        schema: AuthStateValueSchema,
        origin: "central",
      });
      export const queryBackedResource = queryResourceDescriptor<Row>(
        "query-backed", RowSchema, "id",
      );
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("tasksResource")).toEqual([
      {
        key: "tasks",
        keyed: true,
        membership: null,
      },
    ]);
    expect(index.get("taskDetailResource")).toEqual([
      {
        key: "task-detail",
        keyed: false,
        membership: null,
      },
    ]);
    // A central value is an ordinary `liveValue` to the scanner: which runtime
    // serves it is where its `serveValue` call sits.
    expect(index.get("authState")).toEqual([
      {
        key: "auth-state",
        keyed: false,
        membership: null,
      },
    ]);
    expect(index.get("queryBackedResource")).toEqual([
      {
        key: "query-backed",
        keyed: true,
        membership: null,
      },
    ]);
  });

  it("indexes a collection's bounded memberships, and a lookup-only one's :rows alone", () => {
    const src = `
      export const notifications = liveCollection("notifications", {
        row: NotificationSchema, id: "id", filterable: {}, sortable: ["createdAt"],
        default: { orderBy: [["createdAt", "desc"]], limit: 200 }, maxLimit: 500,
        preload: "boot",
      });
      export const taskAutoStart = liveCollection("tasks-auto-start", {
        row: TaskAutoStartRowSchema,
        id: "taskId",
      });
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("notifications")?.[0]?.membership).toBe("window");
    // Lookup-only (no `default:`): the window and `:groups` mints `require` it,
    // so the declaration mints its point sibling and nothing else.
    expect(index.get("taskAutoStart")).toEqual([
      { key: "tasks-auto-start:rows", keyed: true, membership: "point" },
    ]);
    // Both are keyed at runtime — membership is the only thing that tells a
    // bounded resource apart from the legacy unbounded keyed form.
    expect(index.get("notifications")?.[0]?.keyed).toBe(true);
  });

  it("emits one entry per key a collection mints", () => {
    const src = `
      export const eventSources = liveCollection("events.sources", {
        row: EventSourceSchema, id: "id", filterable: {}, sortable: ["name"],
        default: { orderBy: [["name", "asc"]], limit: 100 }, maxLimit: 500,
      });
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("eventSources")).toEqual([
      { key: "events.sources", keyed: true, membership: "window" },
      { key: "events.sources:rows", keyed: true, membership: "point" },
      { key: "events.sources:groups", keyed: false, membership: null },
    ]);
  });

  it("indexes a liveValue as one plain (non-keyed, unbounded-membership) key", () => {
    const src = `
      export const notificationsUnread = liveValue("notifications.unread", {
        schema: UnreadSchema,
        preload: "boot",
      });
      export const taskDetail = liveValue("task-detail", { schema: S, params: ["id"] });
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("notificationsUnread")).toEqual([
      { key: "notifications.unread", keyed: false, membership: null },
    ]);
    expect(index.get("taskDetail")).toEqual([
      { key: "task-detail", keyed: false, membership: null },
    ]);
  });

  it("reads a liveValue's literal load: \"on-demand\" at its spec's own depth, and refuses a dynamic one", () => {
    const src = `
      export const editedFiles = liveValue("edited-files", {
        schema: S.refine(() => ({ load: "on-demand" })),
        params: ["id"],
        load: "on-demand",
      });
      export const pushed = liveValue("pushed", { schema: S, load: "push" });
      export const nested = liveValue("nested", { schema: z.object({ load: "on-demand" }) });
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("editedFiles")).toEqual([
      { key: "edited-files", keyed: false, membership: null, onDemand: true },
    ]);
    expect(index.get("pushed")).toEqual([
      { key: "pushed", keyed: false, membership: null },
    ]);
    expect(index.get("nested")).toEqual([
      { key: "nested", keyed: false, membership: null },
    ]);
    expect(() =>
      buildDescriptorIndex(
        [file(`export const d = liveValue("d", { schema: S, load: MODE });`)],
        { ownerPlugin: false },
      ),
    ).toThrow(/load:.*not a static string literal/);
  });

  it("resolves a local (non-exported) const and ignores factory names in strings/comments", () => {
    const src = `
      const localDesc = resourceDescriptor("local", S, null);
      // export const commented = keyedResourceDescriptor("commented", …)
      const label = "keyedResourceDescriptor(\\"fake\\", …)";
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("localDesc")).toEqual([
      {
        key: "local",
        keyed: false,
        membership: null,
      },
    ]);
    expect(index.has("commented")).toBe(false);
    expect(index.has("fake")).toBe(false);
    expect(index.size).toBe(1);
  });

  it("throws on a declaration whose key is not a literal, naming file and expression", () => {
    const src = `export const hoisted = resourceDescriptor(RESOURCE_KEY, S, null);`;
    expect(() =>
      buildDescriptorIndex([file(src, "/repo/plugins/example/core/r.ts")], {
        ownerPlugin: false,
      }),
    ).toThrow(
      /\/repo\/plugins\/example\/core\/r\.ts:1: resourceDescriptor\(…\) id/,
    );
    expect(() =>
      buildDescriptorIndex([file(src)], { ownerPlugin: false }),
    ).toThrow(/RESOURCE_KEY/);
  });

  it("lets the plugin that OWNS a factory call it with a computed key", () => {
    // `queryResourceDescriptor` implemented in terms of
    // `keyedResourceDescriptor` — the wrapper, not a declaration.
    const src = `
      export function queryResourceDescriptor(key, rowSchema, pkField, opts) {
        const descriptor = keyedResourceDescriptor(key, z.array(rowSchema), [], keyOf, opts);
        return Object.assign(descriptor, { queryPk: pkField });
      }
    `;
    expect(() =>
      buildDescriptorIndex([file(src)], { ownerPlugin: true }),
    ).not.toThrow();
  });

  it("skips a factory call not bound to a const rather than raising", () => {
    const src = `export function make() { return resourceDescriptor(k, S, null); }`;
    expect(buildDescriptorIndex([file(src)], { ownerPlugin: false }).size).toBe(
      0,
    );
  });
});

describe("parseFileBindings", () => {
  // Dedented on purpose: module-level statements sit at column 0 in a real
  // (prettier-formatted) file, which is exactly what the module-scope rule reads.
  const src = [
    `import { tasksResource as tasksDescriptor, pushesResource } from "@plugins/example/core";`,
    `import type { Task } from "@plugins/example/core";`,
    `const localConst = 1;`,
    `function f() { const innerConst = 2; return innerConst; }`,
  ].join("\n");

  it("records imported names with their specifier, aliased or plain", () => {
    const bindings = parseFileBindings(src);
    expect(bindings.get("tasksDescriptor")).toEqual({
      exported: "tasksResource",
      specifier: "@plugins/example/core",
    });
    expect(bindings.get("pushesResource")).toEqual({
      exported: "pushesResource",
      specifier: "@plugins/example/core",
    });
  });

  it("records a module-level const but not one inside a function body", () => {
    const bindings = parseFileBindings(src);
    expect(bindings.get("localConst")).toEqual({
      exported: "localConst",
      specifier: null,
    });
    // A `const` in a function body is a runtime value, not something a register
    // call could resolve through.
    expect(bindings.has("innerConst")).toBe(false);
  });
});

describe("resolveRegisterCall", () => {
  const index = new Map<string, DescriptorInfo[]>([
    ["tasksResource", [{ key: "tasks", keyed: true, membership: null }]],
    [
      "mainAheadCountResource",
      [{ key: "main-ahead-count", keyed: false, membership: null }],
    ],
    [
      "notificationsResource",
      [{ key: "notifications", keyed: true, membership: "window" }],
    ],
    [
      "sourcesCollection",
      [
        { key: "sources", keyed: true, membership: "window" },
        { key: "sources:rows", keyed: true, membership: "point" },
        { key: "sources:groups", keyed: false, membership: null },
      ],
    ],
  ]);
  const bound = (
    local: string,
    exported = local,
    specifier: string | null = null,
  ): FileBindings => new Map([[local, { exported, specifier }]]);

  it("reads a flat inline object form", () => {
    const def = resolveRegisterCall(
      "defineResource",
      `{ key: "reports", mode: "invalidate", loader }`,
      new Map(),
      index,
      where,
      NOTHING_IMPORTED,
    );
    expect(def).toEqual([{ key: "reports", mode: "invalidate" }]);
  });

  it("refuses a flat form with no literal mode rather than guess one", () => {
    // The runtime has no default, so a missing mode means the text does not
    // show it — a spread, a variable — never a push resource.
    expect(() =>
      resolveRegisterCall(
        "defineResource",
        `{ key: "slow-ops", ...base, loader }`,
        new Map(),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toThrow(
      /defineResource\(…\) serves a non-keyed resource with no literal `mode:`/,
    );
    expect(() =>
      resolveRegisterCall(
        "defineExternalResource",
        `{ key: "slow-ops", mode: MODE, loader }`,
        new Map(),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toThrow(/`mode:` is not a static string literal — got `MODE`/);
  });

  it("reads a flat form's mode at its own depth, never a loader's", () => {
    expect(
      resolveRegisterCall(
        "defineExternalResource",
        `{ key: "hosts", loader: () => ({ mode: "push" }), mode: "invalidate" }`,
        new Map(),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toEqual([{ key: "hosts", mode: "invalidate" }]);
  });

  it("resolves a descriptor identifier through an import alias, keyed → keyed", () => {
    const def = resolveRegisterCall(
      "defineResource",
      `tasksDescriptor, { identityTable: "tasks", loader }`,
      bound("tasksDescriptor", "tasksResource", "../../shared/resources"),
      index,
      where,
      NOTHING_IMPORTED,
    );
    expect(def).toEqual([{ key: "tasks", mode: "keyed" }]);
  });

  it("carries the descriptor's bounded membership onto the served resource", () => {
    const def = resolveRegisterCall(
      "windowQueryResource",
      `notificationsDescriptor, { from, where }`,
      bound(
        "notificationsDescriptor",
        "notificationsResource",
        "../../shared/resources",
      ),
      index,
      where,
      NOTHING_IMPORTED,
    );
    expect(def).toEqual([
      {
        key: "notifications",
        mode: "keyed",
        membership: "window",
      },
    ]);
  });

  it("serves every resource a collection minted", () => {
    const defs = resolveRegisterCall(
      "serveCollection",
      `sourcesCollection, { from: _sources }`,
      bound("sourcesCollection", "sourcesCollection", "../../core"),
      index,
      where,
      NOTHING_IMPORTED,
    );
    expect(defs).toEqual([
      { key: "sources", mode: "keyed", membership: "window" },
      { key: "sources:rows", mode: "keyed", membership: "point" },
      // A grouping is a plain push value: no row identity, no membership.
      { key: "sources:groups", mode: "push" },
    ]);
  });

  it("reads a serveValue as push by default, recording its source", () => {
    const valueIndex = new Map<string, DescriptorInfo[]>([
      [
        "unread",
        [{ key: "notifications.unread", keyed: false, membership: null }],
      ],
    ]);
    expect(
      resolveRegisterCall(
        "serveValue",
        // The inline loader's own `source:` / `load:` never count — only the
        // options object's.
        `unread, {
          source: "db",
          loader: async () => ({ source: "x", load: "on-demand", reason: "no" }),
        }`,
        bound("unread", "unread", "../../shared/resources"),
        valueIndex,
        where,
        NOTHING_IMPORTED,
      ),
    ).toEqual([{ key: "notifications.unread", mode: "push", source: "db" }]);
  });

  it("serves an on-demand declaration as invalidate, and reads its unbounded reason", () => {
    const valueIndex = new Map<string, DescriptorInfo[]>([
      [
        "hosts",
        [{ key: "hosts", keyed: false, membership: null, onDemand: true }],
      ],
    ]);
    expect(
      resolveRegisterCall(
        "serveValue",
        `hosts, {
          source: "db",
          loader: readHosts,
          unbounded: { reason: "one row per configured host — a handful" },
        }`,
        bound("hosts"),
        valueIndex,
        where,
        NOTHING_IMPORTED,
      ),
    ).toEqual([
      {
        key: "hosts",
        mode: "invalidate",
        source: "db",
        unbounded: "one row per configured host — a handful",
      },
    ]);
  });

  it("reads a serveValue through its lifecycle / recompute options, which carry lookalike fields", () => {
    const valueIndex = new Map<string, DescriptorInfo[]>([
      [
        "editedFiles",
        [
          {
            key: "edited-files",
            keyed: false,
            membership: null,
            onDemand: true,
          },
        ],
      ],
    ]);
    expect(
      resolveRegisterCall(
        "serveValue",
        // Nested `source:` / `load:` / `unbounded:` inside recomputeOn's mapper,
        // whileSubscribed's body and revalidate never count.
        `editedFiles, {
          source: "external",
          throttleMs: 300,
          recomputeOn: [
            refHeadServed,
            { value: upstream, params: ({ id }) => ({ id, source: "db", load: "push" }) },
          ],
          loader: ({ id }) => loadEditedFilesFor(id),
          revalidate: ({ id }) => signatureFor(id),
          whileSubscribed: async ({ id }, notify) => {
            const w = { unbounded: { reason: "nope" } };
            return watch(id, notify, w);
          },
        }`,
        bound("editedFiles", "editedFiles", "../../core"),
        valueIndex,
        where,
        NOTHING_IMPORTED,
      ),
    ).toEqual([
      { key: "edited-files", mode: "invalidate", source: "external" },
    ]);
  });

  it("files a central serveValue (network/live/central) under the runtime it sits in", () => {
    const central = file(
      `
      import { serveValue } from "@plugins/network/plugins/live/central";
      import { authState } from "@plugins/auth/core";
      export const authStateServed = serveValue(authState, {
        source: "external",
        loader: async () => computeAuthState(),
      });
    `,
      "/repo/plugins/auth/central/internal/auth-resource.ts",
    );
    const resolveAuthCore = (specifier: string, name: string) =>
      specifier === "@plugins/auth/core" && name === "authState"
        ? [{ key: "auth-state", keyed: false, membership: null }]
        : null;
    expect(parseRegisterCalls([central], new Map(), resolveAuthCore)).toEqual([
      { key: "auth-state", mode: "push", source: "external" },
    ]);
  });

  it("reads a non-keyed descriptor's mode from its serverOpts", () => {
    const def = resolveRegisterCall(
      "defineResource",
      `mainAheadCountResource, { mode: "invalidate", loader }`,
      bound("mainAheadCountResource"),
      index,
      where,
      NOTHING_IMPORTED,
    );
    expect(def).toEqual([{ key: "main-ahead-count", mode: "invalidate" }]);
  });

  it("refuses a non-keyed descriptor whose serverOpts show no literal mode", () => {
    // An options variable (or a spread) hides the mode from the text; the
    // runtime requires one, so there is nothing to default to.
    expect(() =>
      resolveRegisterCall(
        "defineResource",
        `mainAheadCountResource, serverOpts`,
        bound("mainAheadCountResource"),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toThrow(/serves a non-keyed resource with no literal `mode:`/);
    expect(() =>
      resolveRegisterCall(
        "defineResource",
        `mainAheadCountResource, { loader: () => ({ mode: "push" }) }`,
        bound("mainAheadCountResource"),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toThrow(/with no literal `mode:`/);
  });

  it("returns nothing for an unbound identifier (generic wrapper param)", () => {
    expect(
      resolveRegisterCall(
        "defineResource",
        `descriptor, serverOpts`,
        new Map(),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toEqual([]);
  });

  it("throws when the identifier IS bound but resolves to no descriptor", () => {
    // The shape a descriptor minted by an unknown factory takes from here — the
    // one that used to vanish silently.
    expect(() =>
      resolveRegisterCall(
        "windowQueryResource",
        `agentPagesDescriptor, { from, where }`,
        bound(
          "agentPagesDescriptor",
          "agentPagesResource",
          "../../shared/resources",
        ),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toThrow(/agentPagesDescriptor/);
    expect(() =>
      resolveRegisterCall(
        "windowQueryResource",
        `agentPagesDescriptor, { from, where }`,
        bound(
          "agentPagesDescriptor",
          "agentPagesResource",
          "../../shared/resources",
        ),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toThrow(/resource-vocabulary/);
  });

  it("resolves a descriptor declared in ANOTHER plugin through the imported resolver", () => {
    const def = resolveRegisterCall(
      "defineResource",
      `mailSyncStateResource, { mode: "push", identityTable: "mail_sync_state", loader }`,
      bound(
        "mailSyncStateResource",
        "mailSyncStateResource",
        "@plugins/apps/plugins/mail/plugins/mail-core/core",
      ),
      index,
      where,
      (specifier, name) =>
        specifier === "@plugins/apps/plugins/mail/plugins/mail-core/core" &&
        name === "mailSyncStateResource"
          ? [{ key: "mail-sync-state", keyed: false, membership: null }]
          : null,
    );
    expect(def).toEqual([{ key: "mail-sync-state", mode: "push" }]);
  });

  it("returns nothing for a flat object with no key", () => {
    expect(
      resolveRegisterCall(
        "defineResource",
        `{ loader, mode: "push" }`,
        new Map(),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toEqual([]);
  });
});

describe("parseRegisterCalls (end to end over runtime sources)", () => {
  const index = buildDescriptorIndex(
    [
      file(`
      export const tasksResource = keyedResourceDescriptor<T[]>("tasks", S, [], k);
      export const pushesResource = resourceDescriptor<P[]>("pushes", S, []);
      export const notifications = liveCollection("notifications", {
        row: S, id: "id", filterable: {}, sortable: ["createdAt"],
        default: { orderBy: [["createdAt", "desc"]], limit: 200 }, maxLimit: 500,
      });
    `),
    ],
    { ownerPlugin: false },
  );

  it("captures every register marker, deduped and sorted", () => {
    const server = file(
      `
      import { defineResource } from "@plugins/framework/plugins/server-core/core";
      import { serveCollection } from "@plugins/network/plugins/live/server";
      import {
        tasksResource as tasksDescriptor,
        pushesResource as pushesDescriptor,
        notifications,
      } from "../../shared/resources";
      export const tasksResource = defineResource(tasksDescriptor, { identityTable: "tasks", loader });
      export const pushesResource = defineResource(pushesDescriptor, { mode: "push", loader });
      export const notificationsServed = serveCollection(notifications, { from, where });
      export const prototypesResource = defineExternalResource({ key: "prototypes", mode: "invalidate", loader });
    `,
      "/repo/plugins/example/server/internal/resources.ts",
    );
    expect(parseRegisterCalls([server], index, NOTHING_IMPORTED)).toEqual([
      { key: "notifications", mode: "keyed", membership: "window" },
      { key: "notifications:groups", mode: "push" },
      { key: "notifications:rows", mode: "keyed", membership: "point" },
      { key: "prototypes", mode: "invalidate" },
      { key: "pushes", mode: "push" },
      { key: "tasks", mode: "keyed" },
    ]);
  });

  it("skips a generic wrapper whose descriptor arg is a runtime value", () => {
    const compiler = file(
      `
      import { defineResource } from "@plugins/framework/plugins/server-core/core";
      export function windowQueryResource(descriptor, spec) {
        return defineResource(descriptor, serverOpts);
      }
    `,
      "/repo/plugins/infra/plugins/query-resource/server/internal/compile-window.ts",
    );
    expect(parseRegisterCalls([compiler], index, NOTHING_IMPORTED)).toEqual([]);
  });
});
