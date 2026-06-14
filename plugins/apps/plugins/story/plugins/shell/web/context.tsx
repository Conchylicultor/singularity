import { createContext, useContext, useState, type ReactNode } from "react";
import { useStories, markStory } from "@plugins/apps/plugins/story/plugins/marker/web";

/**
 * Shared editor state for the story detail surface. Lifted out of `StoryEditor`
 * so the toolbar elements (back button, title, view switcher) can be zero-prop
 * render-slot contributions to {@link StoryToolbar} while the editor body still
 * reads the same `view`/`split` state. Mirrors Sonata's `useSonata()` context,
 * which backs its player-toolbar contributions the same way.
 *
 * Owns all view state: `view` (the active switcher segment — `"author"` or a
 * renderer id) and `split` (whether to show the renderer preview beside the
 * editor). The renderer *choice* persists across sessions via the marker's
 * `defaultRendererId`; the transient `view`/`split` are local.
 */
export interface StoryEditorContextValue {
  pageId: string;
  view: string;
  /** Switch view; persists a renderer choice (not "author") as the story default. */
  setView: (next: string) => void;
  split: boolean;
  toggleSplit: () => void;
  /** The renderer the preview pane should show (active view, or persisted default). */
  activeRendererId: string;
}

const StoryEditorContext = createContext<StoryEditorContextValue | null>(null);

export function useStoryEditor(): StoryEditorContextValue {
  const ctx = useContext(StoryEditorContext);
  if (!ctx) throw new Error("useStoryEditor must be used within a StoryEditorProvider");
  return ctx;
}

export function StoryEditorProvider({
  pageId,
  children,
}: {
  pageId: string;
  children: ReactNode;
}) {
  // The persisted default renderer for this story (null until the user picks
  // one). Read back from the marker so reopening the story restores the lens.
  // Stays null while pending — the editor tolerates the brief flash on first
  // load (a renderer view never falls back to this; only the author preview does).
  const storiesRes = useStories();
  const defaultRendererId = storiesRes.pending
    ? null
    : (storiesRes.data.find((m) => m.pageId === pageId)?.defaultRendererId ?? null);

  const [view, setViewState] = useState<string>("author");
  const [split, setSplit] = useState(false);

  // When the user switches to a renderer, that becomes this story's persisted
  // default lens. "author" is a transient editor mode, not a renderer, so it is
  // never written back to the marker.
  const setView = (next: string) => {
    setViewState(next);
    if (next !== "author") void markStory(pageId, next);
  };

  // The renderer the preview pane should show. In a renderer view it is the
  // active view; in author view it falls back to the persisted default (or `""`,
  // which matches no contribution → `<StoryRender>` shows its visible
  // "No renderer available" fallback, the substrate proof before any renderer
  // plugin exists).
  const activeRendererId = view !== "author" ? view : (defaultRendererId ?? "");

  return (
    <StoryEditorContext.Provider
      value={{
        pageId,
        view,
        setView,
        split,
        toggleSplit: () => setSplit((s) => !s),
        activeRendererId,
      }}
    >
      {children}
    </StoryEditorContext.Provider>
  );
}
