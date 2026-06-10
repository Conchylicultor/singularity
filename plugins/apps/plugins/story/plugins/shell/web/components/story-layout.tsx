import { FullPane } from "@plugins/layouts/plugins/full-pane/web";

/**
 * Story Builder's app surface. Like Sonata, Story is a pure full-surface app, so
 * it mounts the full-pane renderer directly: the active pane (the gallery index
 * at `/story` or the editor at `/story/s/:pageId`) fills the whole surface.
 * Navigation is URL-driven via the pane router — reload / back / forward all
 * persist. There is no app-global state to share in this milestone, so no
 * context provider is needed.
 */
export function StoryLayout() {
  return (
    <div className="h-full min-h-0">
      <FullPane />
    </div>
  );
}
