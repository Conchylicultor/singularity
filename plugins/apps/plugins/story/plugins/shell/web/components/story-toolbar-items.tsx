import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdChevronLeft } from "react-icons/md";
import { usePaneStore } from "@plugins/primitives/plugins/pane/web";
import { useStoryEditor } from "../context";
import { StoryHeader } from "./story-header";
import { StoryViewSwitcher } from "./story-view-switcher";

/**
 * The story editor toolbar contributions. Each is a self-contained, zero-prop
 * component that reads the shared editor state from `useStoryEditor()` — so they
 * drop straight into the render-slot host (no hand-rolled bar). Registered in
 * the shell barrel; rendered by `PaneChrome` as the editor pane's header (the
 * pane sets `chrome: { header: StoryToolbar }`). Mirrors Sonata's
 * `player-toolbar-items.tsx`.
 */

/** ← Stories — clears the route back to the story gallery index pane. */
export function BackToStories() {
  const store = usePaneStore();
  return (
    <Button variant="outline" onClick={() => store.clearRoute()}>
      <MdChevronLeft className="size-4" />
      Stories
    </Button>
  );
}

/** Editable story title. */
export function StoryTitleItem() {
  const { pageId } = useStoryEditor();
  return <StoryHeader pageId={pageId} />;
}

/** Author/renderer segment switcher + split-preview toggle. */
export function ViewSwitcherItem() {
  const { view, setView, split, toggleSplit } = useStoryEditor();
  return (
    <StoryViewSwitcher view={view} onView={setView} split={split} onToggleSplit={toggleSplit} />
  );
}
