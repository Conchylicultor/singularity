import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { blogListPane } from "../panes";

/**
 * The Blog nav link, contributed into the shared header's End zone. Renders the
 * standard (non-CTA) nav link and opens the blog index pane.
 */
export function BlogNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Blog"
      onClick={() => openPane(blogListPane, {}, { mode: "root" })}
    />
  );
}
