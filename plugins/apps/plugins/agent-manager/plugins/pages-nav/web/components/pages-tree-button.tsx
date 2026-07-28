import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdDescription } from "react-icons/md";
import { pagesTreePane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";

export function PagesTreeButton() {
  // Rendered inside the conversation pane, so `useToggle`'s default push has a
  // caller position: the tree opens as a column to the RIGHT of the
  // conversation, and clicking a page adds the detail column beyond it.
  const { isOpen, toggle } = pagesTreePane.useToggle({});

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      title="Pages"
      aria-label="Pages"
      aria-pressed={isOpen}
      onClick={toggle}
    >
      <MdDescription className="size-4" />
    </Button>
  );
}
