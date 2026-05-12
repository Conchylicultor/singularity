export interface BarrelExport {
  name: string;
  kind: "type" | "value";
  category: "type" | "hook" | "component" | "value";
  consumers?: string[];
}

export interface SlotInfo {
  groupName: string;
  memberName: string;
  slotId: string;
  contributors: string[];
}

export interface RouteInfo {
  route: string;
  callers: string[];
}

export interface ResourceInfo {
  key: string;
  mode: string;
}

export interface PublicApi {
  exports: Record<"web" | "server" | "central" | "core" | "shared", BarrelExport[]>;
  importedBy: string[];
  slots: SlotInfo[];
  routes: RouteInfo[];
  resources: ResourceInfo[];
}

export interface PluginNode {
  /** Path relative to plugins/, e.g. "active-data/plugins/conv". */
  path: string;
  /** Last-segment leaf name, e.g. "conv". */
  name: string;
  /** Dotted hierarchy id, e.g. "active-data.conv". */
  hierarchyId: string;
  description?: string;
  loadBearing: boolean;
  runtimes: { web: boolean; server: boolean; central: boolean };
  children: PluginNode[];
  publicApi?: PublicApi;
}

export interface PluginTreePayload {
  plugins: PluginNode[];
  totals: {
    plugins: number;
    loadBearing: number;
    umbrellas: number;
  };
}
