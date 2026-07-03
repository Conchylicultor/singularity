import { describe, expect, it } from "bun:test";
import {
  buildDescriptorIndex,
  parseImportAliases,
  parseRegisterCalls,
  resolveRegisterCall,
  type DescriptorInfo,
} from "./parse-resources";

describe("buildDescriptorIndex", () => {
  it("indexes each descriptor factory with its key and keyed-ness", () => {
    const src = `
      export const tasksResource = keyedResourceDescriptor<TaskListItem[]>(
        "tasks", z.array(TaskListItemSchema), [], (r) => r.id, { bootCritical: true },
      );
      export const taskDetailResource = resourceDescriptor<Task | null, { id: string }>(
        "task-detail", TaskSchema.nullable(), null,
      );
      export const notificationsResource = queryResourceDescriptor<Notification>(
        "notifications", NotificationSchema, "id",
      );
    `;
    const index = buildDescriptorIndex([src]);
    expect(index.get("tasksResource")).toEqual({ key: "tasks", keyed: true });
    expect(index.get("taskDetailResource")).toEqual({ key: "task-detail", keyed: false });
    expect(index.get("notificationsResource")).toEqual({ key: "notifications", keyed: true });
  });

  it("resolves a local (non-exported) const and ignores factory names in strings/comments", () => {
    const src = `
      const localDesc = resourceDescriptor("local", S, null);
      // export const commented = keyedResourceDescriptor("commented", …)
      const label = "keyedResourceDescriptor(\\"fake\\", …)";
    `;
    const index = buildDescriptorIndex([src]);
    expect(index.get("localDesc")).toEqual({ key: "local", keyed: false });
    expect(index.has("commented")).toBe(false);
    expect(index.has("fake")).toBe(false);
    expect(index.size).toBe(1);
  });
});

describe("parseImportAliases", () => {
  it("maps aliased specifiers to their exported name, plain ones fall through", () => {
    const src = `
      import { tasksResource as tasksDescriptor, pushesResource } from "@plugins/example/core";
      import type { Task } from "@plugins/example/core";
    `;
    const aliases = parseImportAliases(src);
    expect(aliases.get("tasksDescriptor")).toBe("tasksResource");
    expect(aliases.has("pushesResource")).toBe(false); // plain: no entry, resolves to itself
  });
});

describe("resolveRegisterCall", () => {
  const index = new Map<string, DescriptorInfo>([
    ["tasksResource", { key: "tasks", keyed: true }],
    ["mainAheadCountResource", { key: "main-ahead-count", keyed: false }],
    ["notificationsResource", { key: "notifications", keyed: true }],
  ]);

  it("reads a flat inline object form", () => {
    const def = resolveRegisterCall(`{ key: "reports", mode: "invalidate", loader }`, new Map(), index);
    expect(def).toEqual({ key: "reports", mode: "invalidate" });
  });

  it("defaults the flat form's mode to push", () => {
    expect(resolveRegisterCall(`{ key: "slow-ops", loader }`, new Map(), index)).toEqual({
      key: "slow-ops",
      mode: "push",
    });
  });

  it("resolves a descriptor identifier through an import alias, keyed → keyed", () => {
    const aliases = new Map([["tasksDescriptor", "tasksResource"]]);
    const def = resolveRegisterCall(`tasksDescriptor, { identityTable: "tasks", loader }`, aliases, index);
    expect(def).toEqual({ key: "tasks", mode: "keyed" });
  });

  it("honours an explicit serverOpts mode over the non-keyed default", () => {
    const def = resolveRegisterCall(`mainAheadCountResource, { mode: "push", loader }`, new Map(), index);
    expect(def).toEqual({ key: "main-ahead-count", mode: "push" });
  });

  it("defaults a non-keyed descriptor to push", () => {
    const def = resolveRegisterCall(`mainAheadCountResource, { loader }`, new Map(), index);
    expect(def).toEqual({ key: "main-ahead-count", mode: "push" });
  });

  it("returns null for an unresolvable identifier (generic wrapper param)", () => {
    expect(resolveRegisterCall(`descriptor, serverOpts`, new Map(), index)).toBeNull();
  });

  it("returns null for a flat object with no key", () => {
    expect(resolveRegisterCall(`{ loader, mode: "push" }`, new Map(), index)).toBeNull();
  });
});

describe("parseRegisterCalls (end to end over runtime sources)", () => {
  const index = buildDescriptorIndex([
    `
      export const tasksResource = keyedResourceDescriptor<T[]>("tasks", S, [], k);
      export const pushesResource = resourceDescriptor<P[]>("pushes", S, []);
      export const notificationsResource = queryResourceDescriptor<N>("notifications", S, "id");
    `,
  ]);

  it("captures descriptor-form defineResource, queryResource, and flat defineExternalResource, deduped and sorted", () => {
    const server = `
      import { defineResource } from "@plugins/framework/plugins/server-core/core";
      import { queryResource } from "@plugins/infra/plugins/query-resource/server";
      import {
        tasksResource as tasksDescriptor,
        pushesResource as pushesDescriptor,
        notificationsResource as notificationsDescriptor,
      } from "@plugins/example/core";
      export const tasksResource = defineResource(tasksDescriptor, { identityTable: "tasks", loader });
      export const pushesResource = defineResource(pushesDescriptor, { loader });
      export const notificationsResource = queryResource(notificationsDescriptor, { from, where });
      export const prototypesResource = defineExternalResource({ key: "prototypes", loader });
    `;
    expect(parseRegisterCalls([server], index)).toEqual([
      { key: "notifications", mode: "keyed" },
      { key: "prototypes", mode: "push" },
      { key: "pushes", mode: "push" },
      { key: "tasks", mode: "keyed" },
    ]);
  });

  it("skips a generic wrapper whose descriptor arg is a runtime value", () => {
    const compiler = `
      import { defineResource } from "@plugins/framework/plugins/server-core/core";
      export function queryResource(descriptor, spec) {
        return defineResource(descriptor, serverOpts);
      }
    `;
    expect(parseRegisterCalls([compiler], index)).toEqual([]);
  });
});
