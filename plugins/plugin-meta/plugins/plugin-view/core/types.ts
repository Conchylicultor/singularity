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

export interface ContributionInfo {
  slot: string;
  id?: string;
  paneId?: string;
  panePath?: string;
}

export interface CommandInfo {
  groupName: string;
  memberName: string;
  commandId: string;
}

export interface TableInfo {
  name: string;
  varName: string;
}

export interface EntityExtensionInfo {
  parentPlugin: string;
  extName: string;
  tableName: string;
}

export interface EntityExtensionRef {
  childPlugin: string;
  extName: string;
  tableName: string;
}

export interface PublicApi {
  exports: Record<"web" | "server" | "central" | "core" | "shared", BarrelExport[]>;
  importedBy: string[];
  slots: SlotInfo[];
  routes: RouteInfo[];
  resources: ResourceInfo[];
  contributions: ContributionInfo[];
  commands: CommandInfo[];
  tables: TableInfo[];
  entityExtensions: EntityExtensionInfo[];
  extendedBy: EntityExtensionRef[];
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
  collapsed: boolean;
  runtimes: { web: boolean; server: boolean; central: boolean };
  children: PluginNode[];
  /**
   * Per-facet extracted data, keyed by facet id. Additive alongside `publicApi`
   * during the facets-v3 migration; optional so existing PluginNode literals stay
   * valid. The tree endpoint always populates it (empty `{}` under skipBarrelImport).
   */
  facets?: Record<string, unknown>;
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
