import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { storyPane } from "../panes";

/**
 * "Story" entry in the shared site header. Opens the story page.
 */
export function StoryNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Story"
      onClick={() => openPane(storyPane, {}, { mode: "root" })}
    />
  );
}
