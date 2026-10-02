import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { Hook } from "@plugins/framework/plugins/hook-value/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type {
  AppShellSidebarItem,
  AppShellToolbarItem,
} from "@plugins/primitives/plugins/app-shell/web";
import type { IconRef } from "@plugins/ui/plugins/icons/core";

/** Which run of the Places sidebar a place sits in. */
export type PlaceGroup = "favorites" | "locations";

/**
 * Where a place leads, once known. A place whose folder or name comes from
 * the server (the Singularity checkout, the startup volume) is `pending` until
 * it answers, and `failed` — still listed, saying why — when it cannot.
 */
export type PlaceState =
  | { kind: "pending" }
  | { kind: "ready"; label: string; path: string }
  | { kind: "failed"; label: string; message: string };

/**
 * One entry of the Places sidebar. `usePlace` resolves it (a hook, so a place
 * may read the server); `path` is in display form (`~/…` under home).
 */
export interface PlaceItem {
  /** Unique among places; the row's key. */
  id: string;
  group: PlaceGroup;
  icon: IconRef;
  usePlace: Hook<() => PlaceState>;
}

export const FileExplorer = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>({
    docLabel: (p) => p.title,
  }),

  Toolbar: defineRenderSlot<AppShellToolbarItem>({
    docLabel: (p) => ("label" in p ? p.label : undefined),
  }),

  /** The places the sidebar lists: Home, Downloads, the startup volume, … */
  Place: defineSlot<PlaceItem>({
    docLabel: (p) => p.id,
  }),
};
