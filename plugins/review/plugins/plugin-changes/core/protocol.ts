export interface DiffList {
  added: string[];
  removed: string[];
}

export interface PluginChangeDiff {
  hierarchyId: string;
  name: string;
  path: string;
  status: "added" | "modified";
  fileCount: number;
  additions: number;
  deletions: number;
  slots: DiffList;
  contributions: DiffList;
  exports: DiffList;
  routes: DiffList;
  apiUses: DiffList;
  resources: DiffList;
  tables: DiffList;
}

export interface PluginChangesResponse {
  plugins: PluginChangeDiff[];
}
