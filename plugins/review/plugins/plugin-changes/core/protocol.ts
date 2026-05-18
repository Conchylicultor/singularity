export interface DiffList {
  added: string[];
  removed: string[];
}

export interface PluginChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  from?: string;
}

export interface PluginChangeDiff {
  hierarchyId: string;
  name: string;
  path: string;
  status: "added" | "modified";
  fileCount: number;
  additions: number;
  deletions: number;
  files: PluginChangedFile[];
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

export interface PluginReviewProps {
  conversationId: string;
  plugin: PluginChangeDiff;
}
