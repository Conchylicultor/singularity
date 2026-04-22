export type TreeItem = {
  id: string;
  parentId: string | null;
  rank: string;
  expanded: boolean;
};

export type RowContext = { hasChildren: boolean };
