import { describe, expect, it } from "bun:test";
import type { ViewTypeMeta } from "../../core";
import type { ResolvedViewInstance } from "./resolve-instances";
import { resolveActiveId } from "./resolve-active-id";

// Only `instance.id` is read, so the viewType is a stand-in.
function inst(id: string): ResolvedViewInstance<ViewTypeMeta> {
  return {
    instance: { id, name: id, type: "list" },
    viewType: {} as ResolvedViewInstance<ViewTypeMeta>["viewType"],
  } as ResolvedViewInstance<ViewTypeMeta>;
}

const instances = [inst("active"), inst("recent"), inst("backups")];

describe("resolveActiveId — unpinned", () => {
  it("prefers the persisted selection", () => {
    expect(resolveActiveId(instances, "backups", "recent", undefined)).toBe(
      "backups",
    );
  });

  it("falls back to the caller's default, then to the first instance", () => {
    expect(resolveActiveId(instances, "gone", "recent", undefined)).toBe(
      "recent",
    );
    expect(resolveActiveId(instances, null, undefined, undefined)).toBe(
      "active",
    );
    expect(resolveActiveId([], null, "recent", undefined)).toBe("");
  });
});

describe("resolveActiveId — pinned", () => {
  it("ignores both the persisted selection and the default", () => {
    expect(resolveActiveId(instances, "active", "recent", "backups")).toBe(
      "backups",
    );
  });

  it("resolves a pinned id that is not authored to '' — NEVER to another instance", () => {
    // The whole point: a mis-pinned host must be able to say so. Returning
    // `instances[0]` here would render the Active tab inside the backup app.
    expect(resolveActiveId(instances, "active", "recent", "backup")).toBe("");
  });
});
