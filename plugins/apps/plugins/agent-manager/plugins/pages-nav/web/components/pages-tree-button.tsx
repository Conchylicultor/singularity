import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdDescription } from "react-icons/md";
import { pagesTreePane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";

export function PagesTreeButton() {
  // Rendered inside the conversation pane, so `useToggle`'s default push has a
  // caller position: the tree opens as a column to the RIGHT of the
  // conversation, and clicking a page adds the detail column beyond it.
  const { isOpen, toggle } = pagesTreePane.useToggle({});

  return (
    <IconButton
      icon={MdDescription}
      label="Pages"
      variant={isOpen ? "secondary" : "ghost"}
      aria-pressed={isOpen}
      onClick={toggle}
    />
  );
}
