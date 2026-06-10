export type StoryRole = "content" | "break"; // "break" = a divider; renderers split/hr on it

export interface StoryNode {
  id: string;
  type: string;
  data: unknown;
  role: StoryRole;
  depth: number; // 0 at top level
  index: number; // sibling index within its parent
  children: StoryNode[];
}
