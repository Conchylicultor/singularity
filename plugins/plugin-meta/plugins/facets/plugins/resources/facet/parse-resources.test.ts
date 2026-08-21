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
        "tasks", z.array(TaskListItemSchema), [], (r) => r.id, { bootCritical: true },
      );
      export const taskDetailResource = resourceDescriptor<Task | null, { id: string }>(
        "task-detail", TaskSchema.nullable(), null,
      );
      export const authStateResource = centralResourceDescriptor<AuthStateValue>(
        "auth-state", AuthStateValueSchema, { providers: {} },
      );
      export const queryBackedResource = queryResourceDescriptor<Row>(
        "query-backed", RowSchema, "id",
      );
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("tasksResource")).toEqual({
      key: "tasks",
      keyed: true,
      membership: null,
    });
    expect(index.get("taskDetailResource")).toEqual({
      key: "task-detail",
      keyed: false,
      membership: null,
    });
    // `centralResourceDescriptor` was known to the eager-tier generator and NOT
    // to this scanner — the two hardcoded lists that are now one vocabulary.
    expect(index.get("authStateResource")).toEqual({
      key: "auth-state",
      keyed: false,
      membership: null,
    });
    expect(index.get("queryBackedResource")).toEqual({
      key: "query-backed",
      keyed: true,
      membership: null,
    });
  });

  it("indexes the bounded-membership factories that used to be invisible", () => {
    const src = `
      export const notificationsResource = windowQueryResourceDescriptor<Notification>(
        "notifications", NotificationSchema, "id", { defaultLimit: 200, bootCritical: true },
      );
      export const taskAutoStartResource = pointQueryResourceDescriptor<TaskAutoStartRow>(
        "tasks-auto-start", TaskAutoStartRowSchema, "taskId",
      );
      export const rawWindowResource = windowResourceDescriptor<Row>(
        "raw-window", RowSchema, keyOf, { defaultLimit: 50 },
      );
      export const rawPointResource = pointResourceDescriptor<Row>(
        "raw-point", RowSchema, keyOf,
      );
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("notificationsResource")?.membership).toBe("window");
    expect(index.get("taskAutoStartResource")?.membership).toBe("point");
    expect(index.get("rawWindowResource")?.membership).toBe("window");
    expect(index.get("rawPointResource")?.membership).toBe("point");
    // All four are keyed at runtime — membership is the only thing that tells a
    // bounded resource apart from the legacy unbounded keyed form.
    for (const name of [
      "notificationsResource",
      "taskAutoStartResource",
      "rawWindowResource",
      "rawPointResource",
    ]) {
      expect(index.get(name)?.keyed).toBe(true);
    }
  });

  it("resolves a local (non-exported) const and ignores factory names in strings/comments", () => {
    const src = `
      const localDesc = resourceDescriptor("local", S, null);
      // export const commented = keyedResourceDescriptor("commented", …)
      const label = "keyedResourceDescriptor(\\"fake\\", …)";
    `;
    const index = buildDescriptorIndex([file(src)], { ownerPlugin: false });
    expect(index.get("localDesc")).toEqual({
      key: "local",
      keyed: false,
      membership: null,
    });
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
    // `windowResourceDescriptor` implemented in terms of `keyedResourceDescriptor`
    // — the wrapper, not a declaration.
    const src = `
      export function windowResourceDescriptor(key, elementSchema, keyOf, opts) {
        const d = keyedResourceDescriptor(key, z.array(elementSchema), [], keyOf, rest);
        return Object.assign(d, { window: { encode, decode } });
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
  const index = new Map<string, DescriptorInfo>([
    ["tasksResource", { key: "tasks", keyed: true, membership: null }],
    [
      "mainAheadCountResource",
      { key: "main-ahead-count", keyed: false, membership: null },
    ],
    [
      "notificationsResource",
      { key: "notifications", keyed: true, membership: "window" },
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
    expect(def).toEqual({ key: "reports", mode: "invalidate" });
  });

  it("defaults the flat form's mode to push", () => {
    expect(
      resolveRegisterCall(
        "defineResource",
        `{ key: "slow-ops", loader }`,
        new Map(),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toEqual({ key: "slow-ops", mode: "push" });
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
    expect(def).toEqual({ key: "tasks", mode: "keyed" });
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
    expect(def).toEqual({
      key: "notifications",
      mode: "keyed",
      membership: "window",
    });
  });

  it("honours an explicit serverOpts mode over the non-keyed default", () => {
    const def = resolveRegisterCall(
      "defineResource",
      `mainAheadCountResource, { mode: "push", loader }`,
      bound("mainAheadCountResource"),
      index,
      where,
      NOTHING_IMPORTED,
    );
    expect(def).toEqual({ key: "main-ahead-count", mode: "push" });
  });

  it("returns null for an unbound identifier (generic wrapper param)", () => {
    expect(
      resolveRegisterCall(
        "defineResource",
        `descriptor, serverOpts`,
        new Map(),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toBeNull();
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
          ? { key: "mail-sync-state", keyed: false, membership: null }
          : null,
    );
    expect(def).toEqual({ key: "mail-sync-state", mode: "push" });
  });

  it("returns null for a flat object with no key", () => {
    expect(
      resolveRegisterCall(
        "defineResource",
        `{ loader, mode: "push" }`,
        new Map(),
        index,
        where,
        NOTHING_IMPORTED,
      ),
    ).toBeNull();
  });
});

describe("parseRegisterCalls (end to end over runtime sources)", () => {
  const index = buildDescriptorIndex(
    [
      file(`
      export const tasksResource = keyedResourceDescriptor<T[]>("tasks", S, [], k);
      export const pushesResource = resourceDescriptor<P[]>("pushes", S, []);
      export const notificationsResource = windowQueryResourceDescriptor<N>(
        "notifications", S, "id", { defaultLimit: 200 },
      );
    `),
    ],
    { ownerPlugin: false },
  );

  it("captures every register marker, deduped and sorted", () => {
    const server = file(
      `
      import { defineResource } from "@plugins/framework/plugins/server-core/core";
      import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
      import {
        tasksResource as tasksDescriptor,
        pushesResource as pushesDescriptor,
        notificationsResource as notificationsDescriptor,
      } from "../../shared/resources";
      export const tasksResource = defineResource(tasksDescriptor, { identityTable: "tasks", loader });
      export const pushesResource = defineResource(pushesDescriptor, { loader });
      export const notificationsResource = windowQueryResource(notificationsDescriptor, { from, where });
      export const prototypesResource = defineExternalResource({ key: "prototypes", loader });
    `,
      "/repo/plugins/example/server/internal/resources.ts",
    );
    expect(parseRegisterCalls([server], index, NOTHING_IMPORTED)).toEqual([
      { key: "notifications", mode: "keyed", membership: "window" },
      { key: "prototypes", mode: "push" },
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
