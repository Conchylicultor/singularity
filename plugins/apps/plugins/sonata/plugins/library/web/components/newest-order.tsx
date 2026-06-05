import type { SortOrderProps } from "../slots";

/**
 * The built-in "Newest" ordering and the dispatch fallback: the song list already
 * arrives newest-first from the live resource (`orderBy(desc(createdAt))`), so this
 * is a pass-through. Lives in the library so the default sort needs no contributor;
 * play-based orderings are contributed separately (e.g. by `playback-history`).
 */
export function NewestOrder({ songs, render }: SortOrderProps) {
  return <>{render(songs)}</>;
}
